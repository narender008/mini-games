"""A small forward-kinematics rig for posing procedural characters frame by frame (no armatures: each frame rebuilds the mesh),
two-bone IK for hands and feet, and easing helpers for keyframed animation.

    sk = Skeleton(hip_h=0.9, ...)            # body proportions in metres (see DIMS)
    F = sk.frames(Pose(hip_l=0.4, ...))      # name -> 4x4 world Matrix of each joint
    m.capsule((0, 0, 0), (0, 0, -sk.d['thigh']), 0.07, 0.05, 'leather', mx=F['hip_l'])

Conventions: the character faces SOUTH (-Y, toward the camera) and stands on z = 0. 'l' is the character's own LEFT, which is
SCREEN RIGHT (+X) when it faces the camera; 'r' is its right hand (screen left, -X). Every limb joint frame has its local -Z
pointing down the bone that starts there (thigh from hip_*, shin from knee_*, foot from ankle_*, upper arm from sh_*, forearm from
elbow_*, hand from wrist_*), so a limb is built from (0, 0, 0) to (0, 0, -length) in that frame. `spine`, `chest`, `neck` and
`head` have +Z up the spine and -Y forward (toward the face). Angles are radians:
  lean (torso pitches forward), roll (tilts toward its left), twist (turns the chest, + = toward its left), hip_twist (pelvis),
  bob (lifts the whole body, m), sway (x, m), fwd (y, m; + = forward), turn (whole body yaw)
  head_pitch (nods down), head_yaw (+ = looks to its left), head_roll
  hip_l/r (leg swings forward), knee_l/r (bends), foot_l/r (toe up), hip_out_l/r (leg spreads out)
  sh_l/r (arm raises forward; pi/2 = straight ahead), sh_out_l/r (arm raises out sideways), elbow_l/r (bends),
  sh_twist_l/r, wrist_l/r (bends the hand forward), wrist_twist_l/r
"""
import math

from mathutils import Matrix, Vector

from bl import rotx, roty, rotz, trans

PI = math.pi

DIMS = dict(hip_h=0.9, hip_w=0.1, thigh=0.44, shin=0.42, foot=0.2, ankle_h=0.07, spine=0.27, chest_h=0.2, sh_w=0.18,
            upper=0.29, fore=0.25, hand=0.08, neck=0.1)


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

    def add(self, other, w=1.0):
        p = Pose(self)
        for k, v in other.items():
            p[k] = p.get(k, 0.0) + v * w
        return p


class Skeleton:
    def __init__(self, **dims):
        self.d = dict(DIMS)
        self.d.update(dims)

    def frames(self, p):
        d = self.d
        F = {}
        root = trans(p.sway, -p.fwd, p.bob) @ rotz(p.turn)
        pelvis = root @ trans(0, 0, d['hip_h']) @ rotz(p.hip_twist)
        F['root'] = root
        F['pelvis'] = pelvis
        # the spine: two segments so a lean bends rather than hinges
        spine = pelvis @ rotx(p.lean * 0.5) @ roty(p.roll * 0.5) @ rotz(p.twist * 0.4)
        F['spine'] = spine
        chest = spine @ trans(0, 0, d['spine']) @ rotx(p.lean * 0.5) @ roty(p.roll * 0.5) @ rotz(p.twist * 0.6)
        F['chest'] = chest
        neck = chest @ trans(0, 0, d['chest_h']) @ rotx(p.head_pitch * 0.4)
        F['neck'] = neck
        head = neck @ trans(0, 0, d['neck']) @ rotx(p.head_pitch * 0.6) @ rotz(p.head_yaw) @ roty(p.head_roll)
        F['head'] = head
        for side, sx in (('l', 1.0), ('r', -1.0)):
            g = lambda k: p.get(k + '_' + side, 0.0)
            # a leg swinging "forward" moves toward -Y: rotx(-a) takes -Z toward -Y; the knee folds the shin back (+Y)
            hip = pelvis @ trans(sx * d['hip_w'], 0, 0) @ rotx(-g('hip')) @ roty(-sx * g('hip_out'))
            knee = hip @ trans(0, 0, -d['thigh']) @ rotx(g('knee'))
            ankle = knee @ trans(0, 0, -d['shin']) @ rotx(-g('knee') + g('hip') - g('foot'))
            F['hip_' + side] = hip
            F['knee_' + side] = knee
            F['ankle_' + side] = ankle
            sh = chest @ trans(sx * d['sh_w'], 0, d['chest_h'] - 0.03) @ rotx(-g('sh')) @ roty(-sx * g('sh_out')) @ rotz(sx * g('sh_twist'))
            elbow = sh @ trans(0, 0, -d['upper']) @ rotx(-g('elbow'))
            wrist = elbow @ trans(0, 0, -d['fore']) @ rotx(-g('wrist')) @ rotz(g('wrist_twist'))
            F['sh_' + side] = sh
            F['elbow_' + side] = elbow
            F['wrist_' + side] = wrist
            F['hand_' + side] = wrist @ trans(0, 0, -d['hand'] * 0.5)
        return F

    def ground_offset(self, p):
        """How far the lowest ankle sits above its standing height for this pose, so callers can plant the feet."""
        F = self.frames(p)
        lo = min(F['ankle_l'].translation.z, F['ankle_r'].translation.z)
        return lo - self.d['ankle_h']


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


def two_bone(S, T, l1, l2, pole):
    """Elbow (or knee) of a two-bone limb from S reaching toward T, bending toward `pole` (a direction).
    Returns (joint, end) as Vectors; the end stops short of T when T is out of reach."""
    S, T = Vector(S), Vector(T)
    d = T - S
    dist = min(max(d.length, 0.05), (l1 + l2) * 0.995)
    n = d.normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    q = Vector(pole)
    q = q - n * q.dot(n)
    if q.length < 1e-5:
        q = n.cross(Vector((0, 0, 1)))
    q.normalize()
    return S + n * a + q * h, S + n * dist


def frame_along(a, b, up=(0, 0, 1)):
    """A 4x4 frame at a whose -Z points to b and whose -Y leans toward `up` (for limbs posed by IK)."""
    a, b = Vector(a), Vector(b)
    z = -(b - a).normalized()
    u = Vector(up)
    y = -(u - z * u.dot(z))
    if y.length < 1e-6:
        y = z.orthogonal()
    y.normalize()
    x = y.cross(z)
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = a
    return M


# ------------------------------------------------------------------------------------------------ easing and keys

def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def ease_out(t, k=2.0):
    t = min(max(t, 0.0), 1.0)
    return 1 - (1 - t) ** k


def ease_in(t, k=2.0):
    t = min(max(t, 0.0), 1.0)
    return t ** k


def keys(t, ks, ease=smooth):
    """Interpolate keyed Poses: ks = [(time, Pose), ...] sorted by time; t outside the range holds the end pose."""
    if t <= ks[0][0]:
        return Pose(ks[0][1])
    for (t0, p0), (t1, p1) in zip(ks, ks[1:]):
        if t <= t1:
            return p0.mix(p1, ease((t - t0) / max(t1 - t0, 1e-9)))
    return Pose(ks[-1][1])


def walk(t, stride=0.5, knee=0.9, arm=0.4, bob=0.035, lean=0.1, roll=0.03, twist=0.12):
    """A run/walk cycle at phase t in [0, 1): legs swing in opposition, the knee folds on the forward swing, arms swing against
    the legs, the body bobs twice per cycle."""
    a = 2 * PI * t
    s = math.sin(a)
    return Pose(
        hip_l=stride * s, hip_r=-stride * s,
        knee_l=knee * max(0.0, math.sin(a + PI * 0.5)) + 0.1, knee_r=knee * max(0.0, math.sin(a - PI * 0.5)) + 0.1,
        foot_l=0.15 * max(0.0, -s), foot_r=0.15 * max(0.0, s),
        sh_l=-arm * s, sh_r=arm * s, elbow_l=0.35, elbow_r=0.35,
        bob=bob * abs(math.cos(a)), lean=lean, roll=roll * s, twist=-twist * s,
    )


IDENT = Matrix.Identity(4)
