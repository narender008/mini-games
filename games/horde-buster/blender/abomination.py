"""The Abomination: the chapter 3 boss. A towering colossus of stitched corpses: pale purple-grey patchwork flesh held together with
crude stitches and staples, faces moaning in its chest and belly, a split gut glowing bile green, ribs poking out of its flank, an
iron collar with chains, a small head with a jaw that hangs open and mismatched glowing eyes. The right arm (screen right) ends in a
huge meat hook on a chain, the left arm (screen left) in a giant butcher's cleaver, held up beside the head.

Frames (default px/m, never an explicit ppm; pivot = the ground under the body; about 7 m tall, the cleaver reaching 300 px left):
  abom_walk_0..5      slow heavy lumber, cleaver up, hook swinging on its chain
  abom_hook_0..3      wind-up (arm cocked up, hook swung behind), throw (arm flung out at the camera, hook gone), chain out (arm held
                      out, body leaning in), pull (arm hauling). Frames 1..3 draw NO hook head and no chain beyond the first link:
                      the game draws the chain and the flying hook from the hook.abom anchors
  abom_vomit_0..3     rears back, lurches with the jaw unhinged and the mouth glowing, heaves (jaw wide, a gush of bile, frame 2), spent
  abom_slam_0..3      cleaver raised (0), swinging down (1), buried in the ground ahead (2), hauled out (3)
  abom_burst_0..1     the belly bulges and the stitches go (0), torn wide open, glowing, ribs and guts spilling (1)
  abom_chain          two chain links pointing up, to tile along the hook's line (size.abom_chain = the spacing, game units)
  abom_head, abom_arm, abom_hook, abom_cleaver, abom_torso, abom_face, abom_leg    gibs (pivot = centre of mass). abom_hook is also the
  flying hook: the eye ring is at the top of the sprite, the point curls at the bottom right
Anchors (game units from the pivot, x right, y down): mouth.abom (vomit frame 2), hook.abom (the chain ring on the hook hand, throw frame
1; hook.abom_2 and hook.abom_3 for frames 2 and 3), cleaver.abom (the blade's edge, slam frame 2), belly.abom (centre of the torn belly,
burst frame 1), head.abom (walk average), ring.abom_hook (where the chain meets the flying hook, from the sprite's centre),
size.abom_head.
"""
import math

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, walk, planted, at

PI = math.pi
SCALE = 1.45

# ------------------------------------------------------------------------------------------------ materials
mats.define('ab_flesh', base='#a99bbd', base2='#8a78a6', pattern='noise', pscale=3.4, pamt=0.65, bump=0.45, bscale=24, seed=71)
mats.define('ab_flesh_hi', base='#c6bad8', base2='#a99bc4', pattern='noise', pscale=4, pamt=0.6, bump=0.4, bscale=26, seed=72)
mats.define('ab_flesh_dark', base='#7d6e9a', base2='#5d4f7a', pattern='noise', pscale=3.2, pamt=0.65, bump=0.5, bscale=24, seed=73)
mats.define('ab_flesh_green', base='#93a894', base2='#6d8470', pattern='noise', pscale=3.6, pamt=0.65, bump=0.45, bscale=24, seed=74)
mats.define('ab_flesh_pink', base='#c4a4b2', base2='#a28090', pattern='noise', pscale=3.4, pamt=0.6, bump=0.4, bscale=24, seed=75)
mats.define('ab_flesh_tan', base='#aa9d8e', base2='#8a7d70', pattern='noise', pscale=3.8, pamt=0.6, bump=0.45, bscale=24, seed=76)
mats.define('ab_thread', base='#2a1a2c', bevel=0.006)
mats.define('ab_staple', base='#d8dfe6', bevel=0.006)
mats.define('ab_bile', base='#8aff3a', base2='#d2ff6e', pattern='noise', pscale=3, pamt=0.6, emit=1.0, bevel=0.02, seed=77)
mats.define('ab_eye', base='#d8ff3c', emit=1.0, bevel=0.004)
mats.define('ab_iron', base='#606878', base2='#3e4452', pattern='noise', pscale=3, pamt=0.55, bevel=0.02, seed=78)
mats.define('ab_rust', base='#9c6038', base2='#6d3f22', pattern='noise', pscale=4, pamt=0.7, bevel=0.015, seed=79)
mats.define('ab_chain', base='#8b95a5', base2='#5a6372', pattern='noise', pscale=5, pamt=0.5, bevel=0.01, seed=80)
mats.define('ab_steel', base='#bcc7d3', base2='#808ea0', pattern='noise', pscale=2.2, pamt=0.55, bevel=0.012, seed=81)
mats.define('ab_edge', base='#f6fafd', bevel=0.008)
mats.define('ab_grip', base='#6e4522', base2='#47290f', pattern='stripes', pscale=7, pamt=0.5, bevel=0.01, seed=82)
mats.define('ab_leather', base='#7e5736', base2='#563a22', pattern='noise', pscale=4, pamt=0.7, bump=0.5, bscale=22, seed=83)
mats.define('ab_hide', base='#b49a7c', base2='#8a7156', pattern='noise', pscale=4, pamt=0.7, bump=0.5, bscale=22, seed=84)
mats.define('ab_gore', base='#7e1220', base2='#b02336', pattern='noise', pscale=5, pamt=0.7, bevel=0.01, seed=85)
mats.define('ab_hair', base='#2b2233', base2='#171220', pattern='noise', pscale=8, pamt=0.7, bump=0.5, seed=86)
mats.define('ab_nail', base='#e0d28f', bevel=0.012)

# ------------------------------------------------------------------------------------------------ proportions
SK = Skeleton(hip_h=1.7, hip_w=0.78, thigh=1.1, shin=1.0, spine=1.5, sh_w=1.36, upper=1.0, fore=0.95, neck=0.25, ankle_h=0.3)

SKC = Vector((0.0, 0.04, 0.5))
SKR = (0.6, 0.56, 0.52)
JAW_PIVOT = (0.0, -0.1, 0.22)
HEAD_D = 2 * SKR[0] * SCALE            # head width in metres (for the size anchor)

BELLY = (Vector((0.0, -0.42, 0.5)), (1.12, 0.98, 0.86))
CHEST = (Vector((0.0, -0.12, 1.22)), (1.38, 0.88, 0.74))

BL0 = 0.62     # where the cleaver blade starts below the hand (m, hand frame)
BLEN = 1.6     # blade length: the edge is at BL0 + BLEN
HS = 0.75        # the hook model's scale
BW = 0.66      # blade half width


# ------------------------------------------------------------------------------------------------ surface helpers

def ell_y(e, x, z):
    c, r = e
    q = 1.0 - ((x - c.x) / r[0]) ** 2 - ((z - c.z) / r[2]) ** 2
    return None if q <= 0 else c.y - r[1] * math.sqrt(q)


def surf(ells, x, z, lift=0.0):
    """A frame on the front of the torso at (x, z) in spine coordinates: X right, Y up the skin, Z out of it."""
    best = None
    for e in ells:
        y = ell_y(e, x, z)
        if y is not None and (best is None or y < best[0]):
            best = (y, e)
    if best is None:
        return None
    y, (c, r) = best
    n = Vector(((x - c.x) / r[0] ** 2, (y - c.y) / r[1] ** 2, (z - c.z) / r[2] ** 2)).normalized()
    up = (Vector((0, 0, 1)) - n * n.z).normalized()
    rt = up.cross(n)
    return Matrix(((rt.x, up.x, n.x, x + n.x * lift), (rt.y, up.y, n.y, y + n.y * lift),
                   (rt.z, up.z, n.z, z + n.z * lift), (0, 0, 0, 1)))


def seam(m, S, ells, x0, z0, x1, z1, n=8, w=0.09, mat='ab_thread', r=0.017, staples=0):
    """A stitched seam on the torso front from (x0, z0) to (x1, z1): a thread line and cross stitches (or staples)."""
    dx, dz = x1 - x0, z1 - z0
    L = math.hypot(dx, dz) or 1.0
    px, pz = -dz / L, dx / L
    prev = None
    for k in range(n + 1):
        t = k / n
        M = surf(ells, x0 + dx * t, z0 + dz * t, 0.012)
        if M is None:
            prev = None
            continue
        pos = M.translation.copy()
        if prev is not None:
            m.capsule(prev, pos, r, r, mat, mx=S, seg=6, rings=2)
        prev = pos
        a = M @ Vector((-px * w, -pz * w, 0.0))
        b = M @ Vector((px * w, pz * w, 0.0))
        if staples and k % staples == 0:
            m.capsule(a, b, r * 1.5, r * 1.5, 'ab_staple', mx=S, seg=5, rings=1)
        else:
            m.capsule(a, b, r, r, mat, mx=S, seg=5, rings=1)


def ring_seam(m, fr, z, rad, n=10, w=0.09, mat='ab_thread', r=0.016):
    """A ring of stitches round a limb at height z of the bone frame fr (-Z runs down the bone)."""
    m.cyl(at(fr, 0, 0, z + 0.012), at(fr, 0, 0, z - 0.012), rad + 0.012, rad + 0.012, mat, seg=18)
    for k in range(n):
        a = 2 * PI * k / n + 0.2
        c, s = math.cos(a) * (rad + 0.02), math.sin(a) * (rad + 0.02)
        m.capsule(at(fr, c, s, z + w), at(fr, c, s, z - w), r, r, mat, seg=5, rings=1)


def chain(m, p0, d, n, ll=0.36, lw=0.22, r=0.05, mat='ab_chain', sag=0.0):
    """n chain links from p0 along direction d (world), alternate links turned a quarter; returns the end point."""
    p0 = Vector(p0)
    d = Vector(d).normalized()
    u1 = d.cross(Vector((0, 1, 0)))
    if u1.length < 0.2:
        u1 = d.cross(Vector((1, 0, 0)))
    u1.normalize()
    u2 = d.cross(u1).normalized()
    step = ll * 0.78
    for k in range(n):
        e = u1 if k % 2 == 0 else u2
        c = p0 + d * (step * (k + 0.5)) + Vector((0, 0, -sag * math.sin(PI * (k + 0.5) / n)))
        pts = []
        for j in range(13):
            a = 2 * PI * j / 12
            pts.append(c + d * (math.cos(a) * ll * 0.5) + e * (math.sin(a) * lw * 0.5))
        m.tube(pts, r, mat, seg=6, cap=False)
    return p0 + d * (step * n)


# ------------------------------------------------------------------------------------------------ faces

def face(m, M, s=1.0, skin='ab_flesh_hi', glow=False, mood=0):
    """A face growing out of the flesh in frame M (X right, Y up the skin, Z out of it): a lump, worried brows, mismatched
    eyes and a gaping moaning mouth. mood 0 wails, 1 gapes with the eyes rolled, 2 snarls."""
    m.ball((0, 0, 0.02 * s), (0.5 * s, 0.56 * s, 0.2 * s), skin, mx=M, seg=18, rings=10)
    for sx, big in ((-1, 1.0), (1, 0.8)):
        rr = 0.15 * s * big
        m.ball((sx * 0.2 * s, 0.31 * s, 0.14 * s), (0.2 * s, 0.07 * s, 0.07 * s), 'ab_flesh_dark', mx=M, rot=rotz(-sx * (0.4 if mood != 2 else -0.4)), seg=10, rings=6)
        m.ball((sx * 0.2 * s, 0.12 * s, 0.17 * s), (rr * 1.15, rr * 1.35, 0.08 * s), 'mouth', mx=M, seg=12, rings=7)
        if glow:
            m.ball((sx * 0.2 * s, 0.12 * s, 0.215 * s), (rr * 0.85, rr * 1.0, 0.06 * s), 'ab_eye', mx=M, seg=12, rings=7)
        else:
            m.ball((sx * 0.2 * s, 0.12 * s, 0.215 * s), (rr * 0.9, rr * 1.05, 0.06 * s), 'eye_white', mx=M, seg=12, rings=7)
            off = (0.0, 0.5 * rr) if mood == 1 else (-sx * 0.35 * rr, -0.1 * rr)
            m.ball((sx * 0.2 * s + off[0], 0.12 * s + off[1], 0.265 * s), (rr * 0.42, rr * 0.42, 0.03 * s), 'pupil', mx=M, seg=8, rings=5)
    m.ball((0, -0.02 * s, 0.22 * s), (0.07 * s, 0.1 * s, 0.07 * s), skin, mx=M, seg=8, rings=5)
    mh = 0.2 if mood != 2 else 0.12
    m.ball((0, -0.26 * s, 0.14 * s), (0.22 * s, mh * s, 0.09 * s), 'mouth', mx=M, seg=14, rings=8)
    m.ball((0, -0.3 * s, 0.19 * s), (0.13 * s, 0.08 * s, 0.05 * s), 'tongue', mx=M, seg=10, rings=6)
    if mood != 2:
        m.capsule((0.1 * s, -0.42 * s, 0.2 * s), (0.12 * s, -0.66 * s, 0.22 * s), 0.035 * s, 0.025 * s, 'ab_gore', mx=M, seg=6, rings=2)
    for x in (-0.14, -0.05, 0.05, 0.14):
        m.box((x - 0.035) * s, (x + 0.035) * s, -0.15 * s, -0.04 * s - 0.0 * s, 0.17 * s, 0.24 * s, 'teeth', mx=M, bevel=0.008 * s)
    for x in (-0.09, 0.09):
        m.box((x - 0.03) * s, (x + 0.03) * s, -0.46 * s, -0.37 * s, 0.17 * s, 0.22 * s, 'teeth', mx=M, bevel=0.008 * s)


# ------------------------------------------------------------------------------------------------ the head

def head(m, H, p, with_head=True, with_jaw=True):
    """Skull of patched skin, mismatched bulging eyes, ruined nose, torn ears, staples, wild hair, and a lower jaw hanging open."""
    if with_head:
        m.ball(SKC, SKR, 'ab_flesh_hi', mx=H, seg=24, rings=14)
        m.ball((-0.36, -0.1, 0.62), (0.3, 0.34, 0.36), 'ab_flesh_green', mx=H, seg=14, rings=8)          # patch from another corpse
        m.ball((0, -0.4, 0.66), (0.52, 0.17, 0.13), 'ab_flesh_dark', mx=H, seg=14, rings=8)              # heavy brow
        # stitched seam down the forehead, staples across the patch edge
        for k in range(6):
            z = 0.98 - 0.09 * k
            m.capsule((-0.08, -0.28 - 0.03 * k, z), (0.08, -0.28 - 0.03 * k, z - 0.02), 0.014, 0.014, 'ab_thread', mx=H, seg=5, rings=1)
        m.capsule((0.0, -0.27, 1.0), (0.0, -0.4, 0.5), 0.014, 0.014, 'ab_thread', mx=H, seg=5, rings=1)
        for k in range(4):
            z = 0.9 - 0.14 * k
            m.capsule((-0.62, -0.1 - 0.015 * k, z + 0.03), (-0.52, -0.2 - 0.015 * k, z - 0.03), 0.02, 0.02, 'ab_staple', mx=H, seg=5, rings=1)
        # right eye: huge and bulging, glowing pupil; left eye: small, glowing
        m.ball((0.26, -0.36, 0.55), (0.22, 0.12, 0.22), 'mouth', mx=H, seg=12, rings=7)
        m.ball((0.26, -0.45, 0.55), (0.2, 0.15, 0.2), 'eye_white', mx=H, seg=14, rings=8)
        m.ball((0.3, -0.59, 0.55), (0.1, 0.05, 0.1), 'ab_eye', mx=H, seg=10, rings=6)
        m.ball((0.3, -0.63, 0.55), (0.04, 0.03, 0.04), 'pupil', mx=H, seg=8, rings=5)
        m.ball((-0.24, -0.4, 0.58), (0.13, 0.08, 0.12), 'mouth', mx=H, seg=12, rings=7)
        m.ball((-0.24, -0.47, 0.58), (0.09, 0.06, 0.085), 'ab_eye', mx=H, seg=10, rings=6)
        # ruined nose
        m.ball((0.0, -0.52, 0.38), (0.14, 0.1, 0.13), 'ab_flesh_dark', mx=H, seg=10, rings=6)
        for sx in (-1, 1):
            m.ball((sx * 0.06, -0.6, 0.34), (0.045, 0.04, 0.05), 'mouth', mx=H, seg=8, rings=5)
        # ears: one torn, one a long droop
        m.cyl((0.55, 0.05, 0.5), (0.95, 0.12, 0.62), 0.15, 0.0, 'ab_flesh_hi', seg=8, mx=H)
        m.cyl((-0.55, 0.05, 0.5), (-0.82, 0.1, 0.36), 0.13, 0.0, 'ab_flesh_green', seg=8, mx=H)
        # a bolt through the skull and a few wild tufts
        m.cyl((0.5, 0.0, 0.7), (0.78, 0.0, 0.76), 0.1, 0.08, 'ab_iron', seg=8, mx=H)
        m.ball((0.8, 0.0, 0.76), (0.12, 0.12, 0.12), 'ab_iron', mx=H, seg=8, rings=5)
        for k, (x, z, ln) in enumerate(((-0.2, 1.02, 0.4), (0.0, 1.06, 0.5), (0.2, 1.0, 0.36), (-0.35, 0.92, 0.3), (0.38, 0.9, 0.3))):
            m.cyl((x, 0.1, z - 0.1), (x * 1.5, 0.2, z + ln), 0.07, 0.0, 'ab_hair', seg=6, mx=H)
    if with_jaw:
        jw = p.jaw
        J = H @ trans(*JAW_PIVOT) @ rotx(jw)
        m.ball((0, -0.34, -0.12), (0.5, 0.36, 0.2), 'ab_flesh', mx=J, seg=16, rings=9)
        m.ball((0, -0.5, -0.12), (0.32, 0.18, 0.17), 'ab_flesh_hi', mx=J, seg=12, rings=7)
        m.ball((0, -0.38, 0.03), (0.4, 0.28, 0.06), 'mouth', mx=J, seg=14, rings=6)
        if p.glow > 0:
            g = p.glow
            m.ball((0, -0.4, 0.05), (0.3 * g, 0.2 * g, 0.1 * g), 'ab_bile', mx=J, seg=12, rings=7)
            m.ball((0, -0.34, 0.5), (0.3 * g, 0.12 * g, 0.28 * g), 'ab_bile', mx=H, seg=12, rings=7)
        # lolling tongue
        m.capsule((0, -0.4, 0.04), (0.04, -0.62, -0.38), 0.12, 0.1, 'tongue', mx=J, seg=10, rings=3)
        for i, x in enumerate((-0.22, -0.08, 0.08, 0.22)):
            m.box(x - 0.045, x + 0.045, -0.66, -0.58, 0.0, 0.12 - 0.03 * (i % 2), 'teeth', mx=J, bevel=0.012)
        for i, x in enumerate((-0.27, -0.1, 0.07, 0.24)):
            m.box(x - 0.04, x + 0.04, -0.68, -0.6, -0.1, 0.0 + 0.0, 'teeth', mx=H @ trans(0, 0.09, 0.4 + 0.02 * (i % 2)), bevel=0.01)
        # bile drool
        m.capsule((0.2, -0.55, -0.05), (0.23, -0.62, -0.42), 0.04, 0.03, 'ab_bile', mx=J, seg=6, rings=2)
        m.ball((0.23, -0.62, -0.46), (0.06, 0.06, 0.08), 'ab_bile', mx=J, seg=8, rings=5)


# ------------------------------------------------------------------------------------------------ the torso

def torso(m, F, p, cut=False):
    S, P, C = F['spine'], F['pelvis'], F['chest']
    sw = p.swell
    belly = (BELLY[0], (BELLY[1][0] * (1 + 0.1 * sw), BELLY[1][1] * (1 + 0.16 * sw), BELLY[1][2] * (1 + 0.1 * sw)))
    ells = (belly, CHEST)
    m.ball((0, 0.05, -0.12), (1.02, 0.78, 0.62), 'ab_flesh_dark', mx=S, seg=18, rings=10)                  # hips
    m.ball(belly[0], belly[1], 'ab_flesh_pink', mx=S, seg=24, rings=14)
    m.ball(CHEST[0], CHEST[1], 'ab_flesh', mx=S, seg=24, rings=14)
    m.ball((0, 0.1, 1.55), (1.2, 0.62, 0.34), 'ab_flesh_dark', mx=S, seg=18, rings=8)                       # trapezius
    m.ball((-0.15, 0.55, 1.15), (1.05, 0.62, 0.7), 'ab_flesh_green', mx=S, seg=18, rings=10)                # back hump
    for k in range(5):                                                                                       # spine staples
        m.cyl((0.0, 0.95, 0.5 + 0.26 * k), (0.0, 1.2, 0.5 + 0.26 * k), 0.09, 0.0, 'ab_iron', seg=6, mx=S)

    # a big patch from another corpse across the right chest and shoulder, seamed in
    M = surf(ells, 0.78, 1.3, 0.0)
    if M is not None:
        m.ball((0, 0, 0.0), (0.62, 0.55, 0.14), 'ab_flesh_green', mx=S @ M, seg=14, rings=8)
    seam(m, S, ells, 0.2, 1.75, 1.2, 1.55, n=7, w=0.1, staples=2)
    seam(m, S, ells, 0.2, 1.75, 0.15, 0.95, n=8, w=0.1)
    seam(m, S, ells, 0.15, 0.95, 1.05, 0.85, n=8, w=0.1, staples=3)
    seam(m, S, ells, -1.0, 0.95, -0.15, 0.95, n=6, w=0.08)
    # a pale patch low on the left of the belly and a tan one at the right flank
    M = surf(ells, 0.9, 0.3, 0.0)
    if M is not None:
        m.ball((0, 0, 0.0), (0.4, 0.4, 0.12), 'ab_flesh_tan', mx=S @ M, seg=12, rings=7)
    seam(m, S, ells, -1.0, 0.0, -0.6, 0.6, n=6, w=0.08)

    # faces: a big wailing one in the left chest, a small snarling one at the right shoulder, one in the belly
    M = surf(ells, -0.66, 1.4, 0.0)
    face(m, S @ M, 0.9, 'ab_flesh_hi', mood=0)
    M = surf(ells, 0.74, 1.46, 0.0)
    face(m, S @ M @ rotz(0.25), 0.56, 'ab_flesh_tan', glow=True, mood=2)
    M = surf(ells, -0.3, 0.46, 0.0)
    face(m, S @ M @ rotz(-0.2), 0.74, 'ab_flesh_pink', mood=1)

    # the split gut glowing bile green, stitched across; it swells and tears open in the burst frames
    M = surf(ells, 0.42, 0.52, 0.0)
    if M is not None:
        Mg = S @ M @ rotz(-0.12)            # X across the wound, Y up it, Z out of the skin
        gw = 0.15 + 0.5 * sw
        gh = 0.52 + 0.3 * sw
        if sw > 0:
            m.ball((0, 0, -0.02), (gw * 1.6, gh * 1.12, 0.1), 'mouth', mx=Mg, seg=16, rings=8)
        m.ball((0, 0, 0.01 + 0.06 * sw), (gw, gh, 0.1 + 0.1 * sw), 'ab_bile', mx=Mg, seg=16, rings=8)
        for sx in (-1, 1):                                                                                   # the lips of the wound
            m.ball((sx * (gw + 0.1), 0, 0.03 + 0.04 * sw), (0.12 + 0.05 * sw, gh * 1.06, 0.11), 'ab_flesh_dark', mx=Mg @ rotz(sx * 0.12 * sw), seg=12, rings=7)
        if sw > 0.3:
            m.ball((0, 0.05, 0.1 + 0.1 * sw), (gw * 0.55, gh * 0.55, 0.1), 'ab_eye', mx=Mg, seg=14, rings=8)     # the hot core
            nf = 14
            for k in range(nf):                                                                              # jagged fangs of torn flesh round the rim
                a2 = 2 * PI * (k + 0.5 * (k % 2)) / nf
                cx, cy = gw * 1.12 * math.cos(a2), gh * 1.02 * math.sin(a2)
                m.cyl((cx, cy, 0.13), (cx * 0.6, cy * 0.6, 0.22), 0.04 + 0.06 * sw, 0.0, 'bone', seg=6, mx=Mg)
            if sw > 0.7:                                                                                      # ribs bowed across the opening
                for yy in (-0.35, 0.0, 0.35):
                    m.tube([(-gw * 1.1, yy, 0.12), (-gw * 0.5, yy + 0.04, 0.3), (gw * 0.5, yy + 0.04, 0.3), (gw * 1.1, yy, 0.12)], 0.05, 'bone', seg=7, mx=Mg)
            # guts spilling out of the bottom of the wound
            m.tube([(0.0, -gh * 0.6, 0.12), (0.12, -gh * 0.95, 0.38), (-0.08, -gh * 1.25, 0.5), (0.14, -gh * 1.6, 0.5)], [0.2 * sw, 0.18 * sw, 0.15 * sw, 0.11 * sw], 'guts', seg=8, mx=Mg)
            m.tube([(-0.12, -gh * 0.7, 0.1), (-0.3, -gh * 1.05, 0.32), (-0.2, -gh * 1.35, 0.42)], [0.15 * sw, 0.13 * sw, 0.1 * sw], 'guts', seg=8, mx=Mg)
            m.ball((0.14, -gh * 1.62, 0.5), (0.1, 0.1, 0.1), 'ab_bile', mx=Mg, seg=8, rings=5)
        else:
            for k in range(7):                                                                              # stitches holding it shut
                y = -gh * 0.8 + gh * 1.6 * k / 6
                m.capsule((-gw - 0.14, y - 0.04, 0.1), (gw + 0.14, y + 0.04, 0.1), 0.022, 0.022, 'ab_thread', mx=Mg, seg=5, rings=1)

    # ribs poking out of a torn patch on the right flank
    M = surf(ells, 1.04, 0.95, 0.0)
    if M is not None:
        Mr = S @ M @ rotz(0.2)
        m.ball((0, 0, 0.0), (0.4, 0.5, 0.1), 'ab_gore', mx=Mr, seg=12, rings=7)
        for k in range(4):
            z = -0.32 + 0.21 * k
            m.tube([(-0.32, z, 0.02), (-0.18, z + 0.03, 0.14), (0.18, z + 0.03, 0.14), (0.32, z, 0.02)], 0.05, 'bone', seg=7, mx=Mr)

    # loincloth of stitched hides and a chain belt
    flap = [(-0.7, 0.0), (0.7, 0.0), (0.64, -1.0), (0.32, -1.38), (0.0, -1.05), (-0.34, -1.4), (-0.66, -1.0)]
    FM = P @ trans(0, -0.78, 0.12) @ rotx(-0.1 + p.flap)
    m.prism(flap, -0.05, 0.05, 'ab_hide', mx=FM, bevel=0.015)
    m.prism([(-0.7, 0.0), (0.0, 0.0), (0.0, -1.05), (-0.34, -1.4), (-0.66, -1.0)], 0.05, 0.075, 'ab_flesh_green', mx=FM)
    for k in range(5):
        m.capsule((0.0, -0.08, -0.1 - 0.2 * k), (0.0, -0.08, -0.22 - 0.2 * k), 0.016, 0.016, 'ab_thread', mx=FM, seg=5, rings=1)
        m.capsule((-0.07, -0.08, -0.17 - 0.2 * k), (0.07, -0.08, -0.15 - 0.2 * k), 0.016, 0.016, 'ab_thread', mx=FM, seg=5, rings=1)
    m.lathe([(-0.2, 1.05), (0.1, 1.05)], 'ab_leather', mx=P @ trans(0, 0.05, -0.12) @ Matrix.Diagonal((1.0, 0.8, 1.0, 1.0)), seg=24, smooth=60, cap=False)
    m.ball((0.0, -0.9, 0.12), (0.25, 0.1, 0.25), 'ab_iron', mx=P, seg=12, rings=7)

    # neck, iron collar with studs and ring eyes, chains draped over the chest
    nk = at(F['head'], 0, 0, 0.3)
    if cut:
        m.cyl(at(C, 0, 0, 0.1), nk, 0.62, 0.5, 'ab_flesh_dark', seg=16)
    else:
        m.capsule(at(C, 0, 0, 0.1), nk, 0.62, 0.5, 'ab_flesh_dark', seg=16, rings=5)
    CM = C @ trans(0, -0.02, 0.18) @ rotx(-0.2)
    m.cyl(at(CM, 0, 0, 0.0), at(CM, 0, 0, 0.32), 0.86, 0.74, 'ab_iron', seg=22, bevel=0.01)
    m.cyl(at(CM, 0, 0, 0.0), at(CM, 0, 0, 0.07), 0.9, 0.9, 'ab_rust', seg=22)
    for k in range(9):
        a = 2 * PI * k / 9 + 0.3
        m.ball(at(CM, 0.85 * math.cos(a), 0.85 * math.sin(a), 0.2), 0.065, 'ab_staple', seg=8, rings=5)
    ends = []
    for sx in (-1, 1):
        eye = at(CM, sx * 0.78, -0.45, 0.14)
        m.ball(eye, (0.14, 0.14, 0.14), 'ab_rust', seg=10, rings=6)
        ends.append(Vector(eye))
    for sx, e in zip((-1, 1), ends):
        tgt = Vector(at(S, sx * 0.28, -0.98, 0.18))
        d = tgt - e
        chain(m, e, d, max(2, int(d.length / 0.28)), sag=0.12)
    m.ball(at(S, 0.0, -1.0, 0.12), (0.2, 0.1, 0.2), 'ab_iron', seg=10, rings=6)


# ------------------------------------------------------------------------------------------------ arms and the tools

def cuff(m, ha, z0=0.38, z1=-0.22, rad=0.54):
    """An iron cuff and rusty bands on the wrist stump (frame ha, -Z down the arm)."""
    m.cyl(at(ha, 0, 0, z0), at(ha, 0, 0, z1), rad, rad * 0.94, 'ab_iron', seg=18, bevel=0.012)
    m.cyl(at(ha, 0, 0, z0 + 0.02), at(ha, 0, 0, z0 - 0.1), rad * 1.07, rad * 1.07, 'ab_rust', seg=18)
    m.cyl(at(ha, 0, 0, z1 + 0.1), at(ha, 0, 0, z1 - 0.02), rad * 1.0, rad * 1.0, 'ab_rust', seg=18)
    for k in range(7):
        a = 2 * PI * k / 7 + 0.4
        m.ball(at(ha, rad * 1.02 * math.cos(a), rad * 1.02 * math.sin(a), 0.1), 0.055, 'ab_staple', seg=8, rings=5)


def blade_pts():
    """The blade outline in the hand frame's XZ plane: a narrow tang at the top widening into a broad slab, a long chopping edge at
    the bottom with a couple of nicks."""
    z0, z1 = -BL0, -(BL0 + BLEN)
    return [(-0.3, z0), (0.3, z0), (BW * 0.96, z0 - 0.5), (BW, z1 + 0.32), (BW * 0.94, z1 + 0.06), (0.4, z1 + 0.09), (0.32, z1 + 0.02),
            (-0.05, z1 + 0.06), (-0.14, z1), (-BW * 0.9, z1 + 0.09), (-BW, z1 + 0.32), (-BW * 0.96, z0 - 0.5)]


def face_cam(ha):
    """A turn about the hand's Z axis that puts the blade's width along the world X axis, so its broad face turns toward the camera."""
    R = ha.to_3x3()
    x0, y0, z0 = R @ Vector((1, 0, 0)), R @ Vector((0, 1, 0)), R @ Vector((0, 0, 1))
    w = Vector((1, 0, 0)) - z0 * z0.x
    if w.length < 0.2:
        return Matrix.Identity(4)
    w.normalize()
    return rotz(math.atan2(w.dot(y0), w.dot(x0)))


def cleaver(m, ha, mx=None):
    """The giant butcher's cleaver, hung from the hand frame ha: a strapped wooden handle, a broad nicked blade with a hole, blood, rust."""
    pts = blade_pts()
    z1 = -(BL0 + BLEN)
    # handle: a thick wooden grip between the cuff and the blade, wrapped in straps, with a knob at the cuff end
    m.cyl(at(ha, 0, 0, -0.2), at(ha, 0, 0, -BL0 - 0.08), 0.2, 0.17, 'ab_grip', seg=10, mx=None)
    for z in (-0.35, -0.5, -0.65):
        m.cyl(at(ha, 0, 0, z + 0.04), at(ha, 0, 0, z - 0.04), 0.225, 0.225, 'ab_leather', seg=10)
    m.prism(pts, -0.1, 0.1, 'ab_steel', mx=ha, bevel=0.012)
    # a bright sharpened edge along the far end
    m.prism([(-BW * 0.99, z1 + 0.3), (-BW * 0.9, z1 + 0.09), (-0.14, z1), (-0.05, z1 + 0.06), (0.32, z1 + 0.02), (0.4, z1 + 0.09),
             (BW * 0.94, z1 + 0.06), (BW * 1.0, z1 + 0.3), (BW * 0.5, z1 + 0.33), (-BW * 0.5, z1 + 0.33)], -0.116, 0.116, 'ab_edge', mx=ha)
    # a spine band along the top, rivets through the tang, the hole
    m.prism([(-0.3, -BL0), (0.3, -BL0), (0.36, -BL0 - 0.12), (-0.36, -BL0 - 0.12)], -0.13, 0.13, 'ab_iron', mx=ha, bevel=0.01)
    for x in (-0.14, 0.14):
        m.ball((x, -0.1, -BL0 - 0.3), (0.05, 0.04, 0.05), 'ab_staple', mx=ha, seg=8, rings=5)
        m.ball((x, 0.1, -BL0 - 0.3), (0.05, 0.04, 0.05), 'ab_staple', mx=ha, seg=8, rings=5)
    hz = -BL0 - 0.78
    m.ball((0.0, 0.0, hz), (0.19, 0.12, 0.19), 'mouth', mx=ha, seg=12, rings=7)
    m.ball((0.0, -0.1, hz), (0.2, 0.02, 0.2), 'ab_iron', mx=ha, seg=12, rings=5)
    m.ball((0.0, 0.1, hz), (0.2, 0.02, 0.2), 'ab_iron', mx=ha, seg=12, rings=5)
    # dried blood running down from the hole and from the edge, rust spots
    for x, zt, ln, w in ((0.0, hz - 0.15, 0.7, 0.07), (0.38, -BL0 - 0.7, 0.6, 0.05), (-0.4, -BL0 - 0.9, 0.5, 0.06), (0.15, -BL0 - 1.1, 0.4, 0.04)):
        m.prism([(x - w, zt), (x + w, zt), (x + w * 0.6, zt - ln), (x, zt - ln - 0.08), (x - w * 0.6, zt - ln)], -0.105, 0.108, 'ab_gore', mx=ha)
    for x, z, r in ((-0.4, -1.1, 0.1), (0.42, -1.5, 0.12), (-0.2, -1.9, 0.08), (0.3, -0.9, 0.07)):
        m.ball((x, 0.0, z - BL0 * 0.5), (r, 0.108, r), 'ab_rust', mx=ha, seg=8, rings=5)


def arm(m, F, side, p, cut=False, tool=True):
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    sx = -1 if side == 'l' else 1
    big = side == 'l'
    up_mat, fo_mat = ('ab_flesh_green', 'ab_flesh_dark') if big else ('ab_flesh_hi', 'ab_flesh_tan')
    r0, r1, r2, r3 = (0.68, 0.56, 0.55, 0.48) if big else (0.6, 0.5, 0.5, 0.42)
    if cut:
        m.cyl(at(sh), at(el), r0, r1, up_mat, seg=16)
    else:
        m.ball(at(sh), r0 * 1.05, 'ab_flesh_dark', seg=16, rings=9)
        m.capsule(at(sh), at(el), r0, r1, up_mat, seg=16, rings=5)
    m.ball(at(el), r1 * 1.02, fo_mat, seg=14, rings=8)
    m.capsule(at(el), at(ha), r2, r3, fo_mat, seg=16, rings=5)
    ring_seam(m, sh, -0.1, r0 * 0.93)
    ring_seam(m, sh, -0.62, r0 * 0.78 if big else r0 * 0.76, n=8)
    ring_seam(m, el, -0.4, r2 * 0.92, n=9)
    # a rusty spike through the elbow
    m.cyl(at(el, sx * 0.3, -0.1, 0.0), at(el, sx * 1.0, -0.3, 0.1), 0.17, 0.0, 'ab_iron', seg=8)
    m.ball(at(el, sx * 0.34, -0.1, 0.0), (0.2, 0.2, 0.2), 'ab_rust', seg=8, rings=5)
    cuff(m, ha)
    if not tool:
        return
    if big:
        # handle between the cuff and the blade
        cleaver(m, ha @ face_cam(ha))
    else:
        m.ball(at(ha, 0, 0, -0.3), (0.2, 0.2, 0.12), 'ab_rust', seg=10, rings=6)
        m.ball(at(ha, 0, 0, -0.38), (0.34, 0.1, 0.34), 'ab_iron', seg=10, rings=6)   # the plate the chain hangs from


def hook_model(m, mx):
    """The meat hook in local coordinates: the eye at the top (z = 0), the shank down, the bend curling toward +X and the point
    coming back up. About 1.9 m tall and 1.5 m wide."""
    eye = []
    for j in range(13):
        a = 2 * PI * j / 12
        eye.append((0.2 * math.cos(a), 0.0, -0.17 + 0.24 * math.sin(a)))
    mx = mx @ scale(HS)
    m.tube(eye, 0.065, 'ab_iron', seg=8, cap=False, mx=mx)
    m.cyl((0, 0, -0.34), (0, 0, -0.5), 0.16, 0.13, 'ab_rust', seg=10, mx=mx)
    m.cyl((0, 0, -0.45), (0, 0, -1.15), 0.15, 0.13, 'ab_iron', seg=10, mx=mx, bevel=0.01)
    m.cyl((0, 0, -0.8), (0, 0, -0.9), 0.17, 0.17, 'ab_rust', seg=10, mx=mx)
    pts, rad = [], []
    n = 14
    for k in range(n + 1):
        a = PI + (PI + 0.85) * k / n
        pts.append((0.7 + 0.7 * math.cos(a), 0.0, -1.15 + 0.7 * math.sin(a)))
        rad.append(0.13 - 0.108 * (k / n) ** 1.6)
    m.tube(pts, rad, 'ab_iron', seg=10, mx=mx)
    tip = Vector(pts[-1])
    m.ball(tip, (0.028, 0.028, 0.028), 'ab_steel', seg=6, rings=4, mx=mx)
    # a barb near the point and a chunk of meat caught on the bend
    b = Vector(pts[-4])
    m.cyl(b, b + Vector((-0.3, 0.0, -0.18)), 0.07, 0.0, 'ab_steel', seg=6, mx=mx)
    m.ball((0.95, 0.0, -1.62), (0.2, 0.17, 0.16), 'meat', seg=10, rings=6, mx=mx)
    m.ball((0.9, -0.05, -1.7), (0.1, 0.1, 0.08), 'guts', seg=8, rings=5, mx=mx)
    return tip


def hook_frame(end, d, curl=1):
    """Matrix placing the hook model with its top at `end`, hanging along d (local -Z -> d), the bend curling toward screen right."""
    z = -Vector(d).normalized()
    x = Vector((curl, 0, 0)) - z * (curl * z.x)
    if x.length < 0.1:
        x = Vector((0, 1, 0)) - z * z.y
    x.normalize()
    y = z.cross(x)
    return Matrix(((x.x, y.x, z.x, end.x), (x.y, y.y, z.y, end.y), (x.z, y.z, z.z, end.z), (0, 0, 0, 1)))


def hook_rig(m, F, p):
    """The wrist ring, the chain and the hook (unless p.hook is False), hanging along p.hdir (a world direction)."""
    ha = F['hand_r']
    d = Vector(p.get('hdir', (0.0, 0.0, -1.0))).normalized()
    n = p.get('hn', 4)
    p0 = Vector(at(ha, 0, 0, -0.5))
    end = chain(m, p0, d, n, sag=p.get('hsag', 0.0)) if n else p0
    if p.get('hook', True):
        hook_model(m, hook_frame(end, d, p.get('curl', 1)))


# ------------------------------------------------------------------------------------------------ legs

def leg(m, F, side, cut=False):
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    left = side == 'l'
    th, sn = ('ab_flesh_green', 'ab_flesh_hi') if left else ('ab_flesh', 'ab_flesh_tan')
    if cut:
        m.cyl(at(hip), at(kn), 0.7, 0.56, th, seg=16)
    else:
        m.ball(at(hip), 0.72, 'ab_flesh_dark', seg=14, rings=8)
        m.capsule(at(hip), at(kn), 0.7, 0.56, th, seg=16, rings=5)
    m.ball(at(kn), 0.58, sn, seg=14, rings=8)
    m.capsule(at(kn), at(an), 0.55, 0.4, sn, seg=16, rings=5)
    ring_seam(m, hip, -0.3, 0.66, n=11)
    ring_seam(m, kn, -0.5, 0.46, n=9)
    if left:   # a rusty knee brace, bare bone showing through the shin
        m.cyl(at(kn, 0, 0, 0.15), at(kn, 0, 0, -0.18), 0.64, 0.62, 'ab_iron', seg=16)
        m.ball(at(kn, 0, -0.62, 0.0), (0.16, 0.12, 0.16), 'ab_rust', seg=8, rings=5)
    else:
        m.ball(at(kn, 0.1, -0.46, -0.4), (0.22, 0.12, 0.3), 'ab_gore', seg=10, rings=6)
        m.capsule(at(kn, 0.1, -0.5, -0.25), at(kn, 0.1, -0.52, -0.62), 0.07, 0.07, 'bone', seg=8, rings=3)
    m.cyl(at(an, 0, 0, 0.12), at(an, 0, 0, 0.0), 0.44, 0.43, 'ab_leather', seg=14)
    R = an.to_3x3().to_4x4()
    m.ball(at(an, 0, -0.36, -0.03), (0.52, 0.7, 0.3), sn, rot=R, seg=16, rings=9)
    for i, x in enumerate((-0.33, -0.11, 0.11, 0.33)):
        r = 0.18 - 0.015 * abs(i - 1.5)
        m.ball(at(an, x, -0.9 + 0.04 * abs(i - 1.5), -0.1), (r, r * 1.05, r * 0.9), 'ab_flesh_hi', rot=R, seg=10, rings=6)
        m.ball(at(an, x, -1.03 + 0.05 * abs(i - 1.5), -0.1), (0.1, 0.07, 0.08), 'ab_nail', rot=R, seg=6, rings=4)


def body(p, parts=('head', 'jaw', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'tools')):
    p = planted(SK, p)
    F = SK.frames(p)
    m = Mesh('abom')
    if 'torso' in parts:
        torso(m, F, p)
    if 'head' in parts or 'jaw' in parts:
        head(m, F['head'], p, with_head='head' in parts, with_jaw='jaw' in parts)
    for s in ('l', 'r'):
        if 'arm_' + s in parts:
            arm(m, F, s, p, tool='tools' in parts)
        if 'leg_' + s in parts:
            leg(m, F, s)
    if 'tools' in parts:
        hook_rig(m, F, p)
    # globs of bile pouring from the mouth (the heave frame) fly off the jaw
    if p.spew > 0:
        J = F['head'] @ trans(*JAW_PIVOT) @ rotx(p.jaw)
        mo = J @ Vector((0.0, -0.5, 0.0))
        # a fan of globs flung forward and down toward the camera (the game fires the real ones along the cone)
        for (dx, f, g, r) in ((0.0, 0.5, 0.2, 0.3), (0.55, 1.1, 0.6, 0.24), (-0.6, 1.2, 0.7, 0.27), (0.15, 1.8, 1.1, 0.2),
                              (-0.3, 2.0, 1.4, 0.18), (0.85, 1.9, 1.2, 0.15), (-0.95, 2.0, 1.3, 0.15), (0.05, 2.5, 1.8, 0.13)):
            m.ball(mo + Vector((dx, -f, -g)), (r, r, r), 'ab_bile', seg=10, rings=6)
        m.capsule(mo, mo + Vector((0.0, -0.9, -0.3)), 0.3, 0.2, 'ab_bile', seg=10, rings=4)
    m.transform(scale(SCALE))
    return m


# ------------------------------------------------------------------------------------------------ poses

def ready_l(p, s=0.0, up=0.0):
    """The cleaver arm held up beside the head: the upper arm out, the forearm (and so the blade) upright, leaning a little outward."""
    p['sh_l'] = 0.1
    p['sh_out_l'] = 1.05 + 0.05 * s
    p['sh_twist_l'] = 1.3
    p['elbow_l'] = 1.85 - 0.08 * s + up


def lumber(t):
    """A slow heavy lurch: huge dragging steps, the cleaver held up beside the head, the hook swinging, the head lolling."""
    p = walk(t, stride=0.4, knee=0.85, arm=0.0, bob=0.2, lean=0.2, roll=0.1, sway=0.12)
    a = 2 * PI * t
    s, c = math.sin(a), math.cos(a)
    ready_l(p, s)
    p['sh_r'] = 0.5 + 0.15 * s
    p['sh_out_r'] = 0.45
    p['elbow_r'] = 1.3 + 0.15 * s
    p['head_pitch'] = -0.7
    p['head_roll'] = 0.12 * s
    p['head_yaw'] = 0.12 * math.sin(a + 1.0)
    p['jaw'] = 0.75 + 0.12 * math.sin(2 * a)
    p['hip_out_l'] = p['hip_out_r'] = 0.08
    p['flap'] = 0.1 * math.sin(2 * a)
    p['hdir'] = (-0.1 + 0.25 * math.sin(a + 1.0), -0.25 + 0.2 * c, -1.0)
    p['hn'] = 2
    p['curl'] = 1
    return p


def hooking(i):
    """Wind-up: arm hauled back and out, hook cocked behind the shoulder (0); throw: twisting hard, arm flung out toward the camera
    with the hook already gone (1); chain out: arm held out as the chain runs (2); pull: hauling it back in (3)."""
    p = walk(0.0, stride=0.1, knee=0.4, arm=0.0, bob=0.0, lean=(-0.06, 0.34, 0.46, 0.14)[i], roll=0.0)
    p['knee_l'] = p['knee_r'] = (0.5, 0.35, 0.45, 0.4)[i]
    p['hip_out_l'] = p['hip_out_r'] = 0.12
    p['twist'] = (0.5, -0.55, -0.62, -0.2)[i]
    ready_l(p)
    p['sh_r'] = (0.1, 1.8, 1.85, 1.3)[i]
    p['sh_out_r'] = (1.3, 0.4, 0.4, 0.3)[i]
    p['sh_twist_r'] = (1.3, 0.0, 0.0, 0.0)[i]
    p['elbow_r'] = (1.8, 0.1, 0.15, 1.2)[i]
    p['head_pitch'] = (-0.55, -0.65, -0.65, -0.7)[i]
    p['head_yaw'] = (0.3, -0.25, -0.3, -0.1)[i]
    p['jaw'] = (0.5, 1.0, 1.0, 0.8)[i]
    p['hook'] = i == 0
    p['hdir'] = [(0.3, 1.0, 0.2), (0.0, -1.0, -0.2), (0.0, -1.0, -0.2), (0.0, -1.0, -0.4)][i]
    p['hn'] = (3, 1, 1, 1)[i]
    p['hsag'] = 0.0
    return p


def vomit(i):
    """Rears back and swells (0), lurches forward with the jaw unhinged (1), heaves: a gush of acid (2), spent and dripping (3)."""
    p = walk(0.0, stride=0.1, knee=0.3, arm=0.0, bob=0.0, lean=(-0.22, 0.3, 0.42, 0.2)[i], roll=0.0)
    p['knee_l'] = p['knee_r'] = (0.35, 0.5, 0.6, 0.4)[i]
    p['hip_out_l'] = p['hip_out_r'] = 0.12
    ready_l(p, 0.0, (0.1, 0.0, -0.1, 0.0)[i])
    p['sh_r'] = (0.7, 0.9, 1.1, 0.7)[i]
    p['sh_out_r'] = (0.5, 0.4, 0.4, 0.4)[i]
    p['elbow_r'] = (1.7, 1.5, 1.4, 1.7)[i]
    p['head_pitch'] = (-0.85, -0.85, -1.0, -0.85)[i]
    p['jaw'] = (0.9, 1.25, 1.45, 0.85)[i]
    p['glow'] = (0.35, 0.8, 1.0, 0.45)[i]
    p['spew'] = (0.0, 0.0, 1.0, 0.0)[i]
    p['swell'] = (0.0, 0.0, 0.0, 0.0)[i]
    p['hdir'] = [(-0.1, 0.1, -1.0), (-0.1, -0.3, -1.0), (-0.1, -0.5, -1.0), (-0.1, -0.2, -1.0)][i]
    p['hn'] = 2
    p['curl'] = 1
    return p


def slamming(i):
    """The cleaver comes up over the head (0), crashes down (1), is buried in the ground ahead of the boss (2), and is hauled out (3)."""
    p = walk(0.0, stride=0.15, knee=0.4, arm=0.0, bob=0.0, lean=(-0.3, 0.2, 0.2, 0.15)[i], roll=0.0)
    p['knee_l'] = p['knee_r'] = (0.5, 0.35, 0.5, 0.4)[i]
    p['hip_l'] = p['hip_r'] = (0.1, -0.1, -0.3, 0.0)[i]
    p['hip_out_l'] = p['hip_out_r'] = 0.14
    p['sh_l'] = (2.5, 1.5, 0.6, 0.95)[i]
    p['sh_out_l'] = (0.5, 0.25, 0.08, 0.15)[i]
    p['sh_twist_l'] = 0.0
    p['elbow_l'] = (0.1, 0.2, 0.2, 0.3)[i]
    p['sh_r'] = (0.7, 0.9, 0.9, 0.7)[i]
    p['sh_out_r'] = (0.5, 0.45, 0.4, 0.4)[i]
    p['elbow_r'] = 1.1
    p['head_pitch'] = (-0.4, -0.7, -1.0, -0.75)[i]
    p['jaw'] = (1.0, 0.9, 0.5, 0.6)[i]
    p['flap'] = (0.1, 0.2, 0.4, 0.1)[i]
    p['hdir'] = [(0.0, 0.5, -1.0), (0.0, -0.3, -1.0), (-0.1, -0.5, -1.0), (0.0, -0.2, -1.0)][i]
    p['hn'] = 2
    p['curl'] = 1
    return p


def bursting(i):
    """Roaring head back as the belly bulges and the stitches pop (0); the gut torn wide open, glowing and gushing (1)."""
    p = walk(0.0, stride=0.1, knee=0.3, arm=0.0, bob=0.0, lean=(-0.28, -0.06)[i], roll=0.0)
    p['knee_l'] = p['knee_r'] = (0.35, 0.5)[i]
    p['hip_out_l'] = p['hip_out_r'] = 0.14
    ready_l(p, 0.0, (0.0, -0.15)[i])
    p['sh_out_l'] = (1.15, 1.3)[i]
    p['sh_r'] = (0.4, 0.3)[i]
    p['sh_out_r'] = (0.6, 0.9)[i]
    p['elbow_r'] = (1.2, 1.0)[i]
    p['head_pitch'] = (-1.0, -0.85)[i]
    p['jaw'] = (1.2, 1.4)[i]
    p['swell'] = (0.45, 1.0)[i]
    p['hdir'] = [(-0.1, 0.1, -1.0), (-0.1, -0.1, -1.0)][i]
    p['hn'] = 2
    p['curl'] = 1
    p['flap'] = (0.2, 0.5)[i]
    return p


# ------------------------------------------------------------------------------------------------ build

def pt(p, local, frame='head'):
    F = SK.frames(planted(SK, p))
    return ((F[frame] @ Vector(local)) * SCALE).to_tuple()


def build(ctx):
    ink = dict(outline=2.4)
    ctx.anim('abom_walk', 6, lambda i: body(lumber(i / 6)), ink=ink)
    ctx.anim('abom_hook', 4, lambda i: body(hooking(i)), ink=ink)
    ctx.anim('abom_vomit', 4, lambda i: body(vomit(i)), ink=ink)
    ctx.anim('abom_slam', 4, lambda i: body(slamming(i)), ink=ink)
    ctx.anim('abom_burst', 2, lambda i: body(bursting(i)), ink=ink)

    # ---- anchors
    p = vomit(2)
    F = SK.frames(planted(SK, p))
    J = F['head'] @ trans(*JAW_PIVOT) @ rotx(p.jaw)
    ctx.anchor('mouth', 'abom', ((J @ Vector((0, -0.5, -0.05))) * SCALE).to_tuple())
    for i, key in ((1, 'abom'), (2, 'abom_2'), (3, 'abom_3')):
        F = SK.frames(planted(SK, hooking(i)))
        ctx.anchor('hook', key, ((F['hand_r'] @ Vector((0, 0, -0.5))) * SCALE).to_tuple())
    F = SK.frames(planted(SK, slamming(2)))
    ctx.anchor('cleaver', 'abom', ((F['hand_l'] @ Vector((0, 0, -(BL0 + BLEN)))) * SCALE).to_tuple())
    p = bursting(1)
    F = SK.frames(planted(SK, p))
    ells = ((BELLY[0], (BELLY[1][0] * 1.1, BELLY[1][1] * 1.16, BELLY[1][2] * 1.1)), CHEST)
    M = surf(ells, 0.5, 0.5, 0.0)
    ctx.anchor('belly', 'abom', ((F['spine'] @ M.translation) * SCALE).to_tuple())
    hx = hy = hz = 0.0
    for i in range(6):
        c = pt(lumber(i / 6), SKC)
        hx += c[0] / 6
        hy += c[1] / 6
        hz += c[2] / 6
    ctx.anchor('head', 'abom', (hx, hy, hz))
    ctx.value('size', 'abom_head', round(HEAD_D * bl.UNITS_PER_M, 1))

    # ---- gibs, built around the origin
    h = Mesh('head')
    hp = Pose(jaw=0.9)
    head(h, trans(0, 0, 0), hp)
    h.ball((0, 0.0, 0.06), (0.5, 0.45, 0.12), 'meat', seg=16, rings=6)
    h.ball((0, -0.02, 0.08), (0.3, 0.26, 0.1), 'guts', seg=12, rings=6)
    h.capsule((-0.08, 0.05, 0.08), (0.0, 0.1, 0.28), 0.07, 0.06, 'bone', seg=8, rings=3)
    h.transform(trans(-SKC.x, -SKC.y, -SKC.z - 0.1))
    h.transform(rotx(-0.5))
    h.transform(scale(SCALE))
    ctx.one('abom_head', h, ink=ink)

    F0 = SK.frames(Pose(sh_out_l=0.0))
    a = Mesh('arm')
    Fa = SK.frames(Pose(sh_r=0.9, elbow_r=0.9, sh_out_r=0.3))
    arm(a, Fa, 'r', Pose(), cut=True, tool=False)
    SH = Fa['sh_r']
    a.ball((0, 0, 0.0), (0.58, 0.56, 0.14), 'meat', mx=SH, seg=14, rings=6)
    a.ball((0, 0, 0.04), (0.36, 0.34, 0.1), 'guts', mx=SH, seg=12, rings=5)
    a.capsule((0.0, 0.0, 0.0), (0.0, 0.0, 0.3), 0.13, 0.11, 'bone', mx=SH, seg=8, rings=3)
    chain(a, Vector(at(Fa['hand_r'], 0, 0, -0.5)), (0.3, -0.5, -1.0), 2, sag=0.0)
    mid = (Vector(at(Fa['sh_r'])) + Vector(at(Fa['hand_r']))) / 2
    a.transform(trans(-mid.x, -mid.y, -mid.z))
    a.transform(rotx(0.55))
    a.transform(scale(SCALE))
    ctx.one('abom_arm', a, ink=ink)

    # the meat hook alone: the eye ring at the top, so the game can rotate it along the throw and chain from the ring
    hk = Mesh('hook')
    tip = hook_model(hk, Matrix.Identity(4))
    centre = Vector((0.5, 0.0, -0.95)) * HS
    hk.transform(trans(*(-centre)))
    hk.transform(scale(SCALE))
    ctx.one('abom_hook', hk, ink=ink)
    ctx.anchor('ring', 'abom_hook', ((Vector((0.0, 0.0, 0.0)) - centre) * SCALE).to_tuple())

    # the cleaver alone, lying across the frame, the handle at the top left
    cl = Mesh('cleaver')
    HA = roty(0.55)
    cleaver(cl, HA)
    cl.cyl(at(HA, 0, 0, 0.1), at(HA, 0, 0, -0.2), 0.3, 0.25, 'ab_iron', seg=14)
    cl.transform(trans(*(-(HA @ Vector((0.0, 0.0, -(BL0 + BLEN) * 0.5))))))
    cl.transform(scale(SCALE))
    ctx.one('abom_cleaver', cl, ink=ink)

    # one stretch of the chain (two links, pointing up) for the game to tile along the hook's line: size.abom_chain is the spacing
    ch = Mesh('chain')
    step = 0.36 * 0.78
    chain(ch, Vector((0.0, 0.0, -step)), (0.0, 0.0, 1.0), 2)
    ch.transform(scale(SCALE))
    ctx.one('abom_chain', ch, ink=ink)
    ctx.value('size', 'abom_chain', round(2 * step * SCALE * bl.UNITS_PER_M, 1))

    lg = Mesh('leg')
    Fl = SK.frames(Pose(hip_r=0.5, knee_r=0.9))
    leg(lg, Fl, 'r', cut=True)
    HP = Fl['hip_r']
    lg.ball((0, 0, 0.0), (0.7, 0.68, 0.14), 'meat', mx=HP, seg=14, rings=6)
    lg.ball((0, 0, 0.04), (0.42, 0.4, 0.1), 'guts', mx=HP, seg=12, rings=5)
    lg.capsule((0.0, 0.0, 0.0), (0.0, 0.0, 0.3), 0.15, 0.13, 'bone', mx=HP, seg=8, rings=3)
    mid = (Vector(at(Fl['hip_r'])) + Vector(at(Fl['ankle_r']))) / 2
    lg.transform(trans(-mid.x, -mid.y, -mid.z))
    lg.transform(rotx(0.5))
    lg.transform(scale(SCALE))
    ctx.one('abom_leg', lg, ink=ink)

    tr = Mesh('torso')
    torso(tr, F0, Pose(), cut=True)
    for sx in (-1, 1):
        tr.ball(at(F0['sh_l' if sx < 0 else 'sh_r']), (0.6, 0.58, 0.3), 'meat', seg=12, rings=6)
        tr.ball(at(F0['hip_l' if sx < 0 else 'hip_r']), (0.7, 0.6, 0.25), 'meat', seg=12, rings=6)
        tr.ball(at(F0['hip_l' if sx < 0 else 'hip_r'], 0, 0, -0.08), (0.4, 0.32, 0.15), 'guts', seg=10, rings=5)
    tr.ball(at(F0['head'], 0, 0, 0.3), (0.55, 0.5, 0.13), 'meat', seg=12, rings=6)
    tr.ball(at(F0['head'], 0, 0, 0.34), (0.3, 0.27, 0.1), 'guts', seg=10, rings=5)
    tr.capsule(at(F0['head'], 0, 0, 0.25), at(F0['head'], 0, 0, 0.55), 0.1, 0.08, 'bone', seg=8, rings=3)
    tr.transform(trans(0, 0, -1.8))
    tr.transform(rotx(-0.35))
    tr.transform(scale(SCALE))
    ctx.one('abom_torso', tr, ink=ink)

    # a face torn off with its patch of skin
    fc = Mesh('face')
    fc.ball((0, 0.0, -0.05), (0.62, 0.7, 0.16), 'ab_flesh_green', seg=16, rings=8)
    fc.ball((0, 0.0, -0.13), (0.54, 0.62, 0.1), 'ab_gore', seg=14, rings=7)
    face(fc, trans(0, 0, 0.05), 1.0, 'ab_flesh_hi', mood=0)
    for k in range(8):
        a2 = 2 * PI * k / 8
        fc.capsule((0.62 * math.cos(a2) * 0.95, 0.7 * math.sin(a2) * 0.95, 0.06), (0.62 * math.cos(a2) * 0.7, 0.7 * math.sin(a2) * 0.7, 0.1), 0.02, 0.02, 'ab_thread', seg=5, rings=1)
    fc.transform(rotx(0.9))
    fc.transform(scale(SCALE))
    ctx.one('abom_face', fc, ink=ink)
