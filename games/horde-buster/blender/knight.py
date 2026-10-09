"""The knight: an undead armoured knight (about 2.1 m) in rusty iron plate: a great helm with a T visor and glowing red eyes,
breastplate, spiked pauldrons, a tattered red tabard, a rusty sword, and a big iron-rimmed tower shield with a skull emblem held
in FRONT of the body (the silhouette: it soaks bullets until it breaks). Also the same knight with the shield gone and the
breastplate cracked open on rotten flesh, and its gore parts.

Frames (default bl.PPM px/m, pivot = the ground under the body):
  knight_walk_0..7          marching, shield up
  knight_bare_0..7          the same march, shield gone, breastplate cracked showing rotten flesh and ribs, helm cracked
  knight_attack_0..3        sword chop with the shield still up: sword raised behind (0), swinging (1), impact in front (2), recover (3)
  knight_bare_attack_0..3   the same chop without the shield (extra, for when the shield has broken)
  knight_head (helm with a skull inside), knight_arm, knight_leg, knight_torso, knight_shield (the whole shield, cracked),
  knight_shard_0..1 (shield fragments), knight_plate (a torn-off armour plate)   gibs (pivot = centre)
Anchors: head.knight (the helm's centre on the walk frames, game units from the pivot), size.knight_head, shield.knight (the
shield face's centre on the walk frames, game units from the pivot) and shieldsize.knight ([width, height] of the shield in
game units, as it stands on the walk frames).
"""
import math

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, walk, planted, at

PI = math.pi

SK = Skeleton(hip_h=0.92, hip_w=0.17, thigh=0.46, shin=0.46, spine=0.58, sh_w=0.37, upper=0.3, fore=0.3, neck=0.06, ankle_h=0.08)
HELM_CZ = 0.26                      # the helm's centre height in the head frame
SH_W, SH_H = 0.84, 1.16             # shield size (metres)
SH_C = (-0.05, -0.47, 1.02)         # shield centre relative to the root (metres)

mats.define('knight_iron', base='#8f9aab', base2='#a85a2c', pattern='noise', pscale=5, pamt=0.75, bump=0.5, bevel=0.015, seed=81)
mats.define('knight_dark', base='#4a505e', base2='#6e4630', pattern='noise', pscale=6, pamt=0.6, bump=0.4, bevel=0.012, seed=82)
mats.define('knight_rust', base='#b0602e', base2='#6e3a1c', pattern='noise', pscale=7, pamt=0.7, bump=0.5, bevel=0.012, seed=83)
mats.define('knight_cloth', base='#9a2e30', base2='#5e1a20', pattern='noise', pscale=6, pamt=0.7, bump=0.3, seed=84)
mats.define('knight_rot', base='#a2b866', base2='#667a48', pattern='noise', pscale=8, pamt=0.7, bump=0.5, seed=85)
mats.define('knight_blood', base='#6a0d16', base2='#8c1520', pattern='noise', pscale=6, pamt=0.5, seed=86)
mats.define('knight_crack', base='#16121a', bevel=0.004)
mats.define('knight_blade', base='#cfd6de', base2='#9a6035', pattern='noise', pscale=9, pamt=0.5, bevel=0.006, seed=87)
mats.define('knight_leather', base='#5c3b27', base2='#3e281b', pattern='noise', pscale=7, pamt=0.7, bump=0.3, seed=88)

HELM = [(-0.02, 0.17), (0.04, 0.2), (0.12, 0.228), (0.3, 0.238), (0.4, 0.228), (0.465, 0.185), (0.505, 0.105), (0.52, 0.0)]


def helm_r(z):
    for (z0, r0), (z1, r1) in zip(HELM, HELM[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return HELM[-1][1]


def helm_pt(x, z, out=0.0):
    """A point on the front of the helm (head frame) at sideways x and height z."""
    r = helm_r(z)
    return (x, -math.sqrt(max(r * r - x * x, 1e-4)) - out, z)


# ------------------------------------------------------------------------------------------------ the shield

def shield_pts(w=SH_W, h=SH_H, inset=0.0):
    """The tower shield's outline in its XZ plane (CCW, centre at the origin): a rounded top, straight sides, a blunt point below."""
    hw, hh = w / 2 - inset, h / 2 - inset
    arc = 0.3 * hh
    top = hh - arc
    pts = [(hw * math.cos(PI * i / 7), top + arc * math.sin(PI * i / 7)) for i in range(8)]
    pts += [(-hw, -hh * 0.35), (-hw * 0.72, -hh * 0.78), (0.0, -hh), (hw * 0.72, -hh * 0.78), (hw, -hh * 0.35)]
    return pts


def shield(m, mx, cracked=False):
    """The shield in its own frame: face toward -Y. A dark iron rim, a rusty steel face, two straps, a crimson roundel with a bone
    skull and crossed bones, rivets. cracked adds a broken corner and long cracks (the gib)."""
    m.slab(shield_pts(), -0.045, 0.04, 'knight_dark', mx=mx, bevel=0.012)
    m.slab(shield_pts(inset=0.06), -0.08, 0.0, 'knight_iron', mx=mx, bevel=0.01)
    hw = SH_W / 2
    for z, hwid in ((0.34, hw - 0.05), (-0.36, hw * 0.78)):                       # iron straps across the face
        m.box(-hwid, hwid, -0.098, -0.07, z - 0.04, z + 0.04, 'knight_dark', mx=mx, bevel=0.008)
    for z, hwid in ((0.34, hw - 0.07), (-0.36, hw * 0.78 - 0.02)):
        for x in (-hwid, hwid):
            m.ball((x, -0.1, z), (0.022, 0.014, 0.022), 'knight_iron', mx=mx, seg=8, rings=5)
    # the roundel and the skull: a big bone skull, fangs and all, on a crimson disc
    m.ball((0, -0.085, 0.0), (0.33, 0.02, 0.33), 'knight_dark', mx=mx, seg=24, rings=8)
    m.ball((0, -0.1, 0.0), (0.3, 0.02, 0.3), 'knight_cloth', mx=mx, seg=24, rings=8)
    m.ball((0, -0.15, 0.06), (0.2, 0.07, 0.18), 'bone', mx=mx, seg=20, rings=12)                    # cranium
    m.ball((0, -0.15, -0.12), (0.13, 0.065, 0.085), 'bone', mx=mx, seg=16, rings=8)                  # jaw
    for s in (-1, 1):
        m.ball((s * 0.085, -0.215, 0.07), (0.065, 0.032, 0.07), 'knight_crack', mx=mx, seg=12, rings=8)   # eye sockets
        m.ball((s * 0.05, -0.21, -0.115), (0.014, 0.012, 0.06), 'knight_crack', mx=mx, seg=6, rings=4)     # gaps between the teeth
    m.ball((0, -0.215, -0.02), (0.03, 0.022, 0.045), 'knight_crack', mx=mx, seg=8, rings=5)         # nose
    m.ball((0, -0.21, -0.115), (0.014, 0.012, 0.06), 'knight_crack', mx=mx, seg=6, rings=4)
    # rivets round the rim
    pts = shield_pts(inset=0.032)
    for i in range(0, len(pts)):
        if i % 2 == 0:
            m.ball((pts[i][0], -0.085, pts[i][1]), (0.018, 0.014, 0.018), 'knight_iron', mx=mx, seg=8, rings=5)
    if cracked:
        for pts in (((0.1, 0.52), (0.04, 0.36), (0.12, 0.3), (0.02, 0.18), (0.08, 0.1)),
                    ((-0.3, 0.1), (-0.18, -0.02), (-0.22, -0.16), (-0.1, -0.3))):
            m.tube([(x, -0.103, z) for x, z in pts], 0.011, 'knight_crack', seg=5, mx=mx, cap=False)


# ------------------------------------------------------------------------------------------------ parts

def helm(m, F, cracked=False, mx=None, skull=False):
    """A great helm: iron bucket with a banded brow, a T-shaped visor slit with two glowing red eyes, breathing holes, a
    horsehair plume. Built in the head frame (face toward -Y); cracked adds a split with rotten flesh showing."""
    H = F['head'] if mx is None else mx
    m.lathe(HELM, 'knight_iron', mx=H, seg=24, smooth=70.0, cap=False)
    m.lathe([(0.335, 0.236), (0.35, 0.247), (0.39, 0.247), (0.405, 0.234)], 'knight_dark', mx=H, seg=24, smooth=60.0, cap=False)   # brow band
    m.lathe([(-0.025, 0.2), (0.0, 0.25), (0.06, 0.255), (0.09, 0.2)], 'knight_dark', mx=H, seg=24, smooth=60.0, cap=False)       # neck guard
    # T visor: a dark slit with the eyes inside it, and a dark vertical slit below
    for i in range(10):
        x = -0.18 + 0.04 * i
        p = helm_pt(x, 0.3, -0.004)
        m.ball(p, (0.034, 0.014, 0.044), 'knight_crack', mx=H, seg=10, rings=6)
    for z in (0.235, 0.19, 0.145, 0.1):
        m.ball(helm_pt(0.0, z, -0.004), (0.026, 0.013, 0.034), 'knight_crack', mx=H, seg=8, rings=5)
    for s in (-1, 1):
        m.ball(helm_pt(s * 0.105, 0.3, -0.012), (0.07, 0.02, 0.034), 'eye_glow_red', mx=H, seg=12, rings=6)
        for z in (0.12, 0.17, 0.22):                                                # breathing holes
            m.ball(helm_pt(s * 0.115, z, -0.002), (0.011, 0.01, 0.011), 'knight_crack', mx=H, seg=6, rings=4)
        for z in (0.07, 0.43):                                                      # rivets
            m.ball(helm_pt(s * 0.17, z, 0.0), (0.014, 0.012, 0.014), 'knight_dark', mx=H, seg=6, rings=4)
    # a horsehair crest along the crown, front to back: a low, broad ridge (a tall thin fin reads as an antenna from the front)
    m.prism([(-0.16, 0.42), (-0.12, 0.52), (-0.02, 0.575), (0.1, 0.56), (0.22, 0.48), (0.27, 0.34), (0.2, 0.42), (0.1, 0.46), (-0.02, 0.46)],
            -0.055, 0.055, 'knight_cloth', mx=H @ rotz(PI / 2), bevel=0.02, smooth=60.0)
    if cracked:
        # a split across the dome and cheek, rotten flesh pushing through
        m.ball(helm_pt(0.17, 0.4, 0.0), (0.06, 0.04, 0.07), 'knight_rot', mx=H, seg=10, rings=6)
        m.tube([helm_pt(0.04, 0.5), helm_pt(0.1, 0.45), helm_pt(0.15, 0.4), helm_pt(0.19, 0.34), helm_pt(0.2, 0.26), helm_pt(0.18, 0.18)],
               0.01, 'knight_crack', seg=5, mx=H, cap=False)
    if skull:                                                                      # the gib: a skull showing in the open neck
        m.ball((0, 0.0, 0.08), (0.17, 0.16, 0.17), 'bone', mx=H, seg=16, rings=10)
        for s in (-1, 1):
            m.ball((s * 0.065, -0.06, 0.04), (0.04, 0.05, 0.045), 'knight_crack', mx=H, seg=10, rings=6)
            m.ball((s * 0.065, -0.07, 0.04), (0.026, 0.03, 0.028), 'eye_glow_red', mx=H, seg=8, rings=5)
        m.ball((0, 0.0, -0.08), (0.11, 0.1, 0.05), 'knight_blood', mx=H, seg=12, rings=6)
        m.ball((0.0, -0.04, -0.075), (0.09, 0.07, 0.03), 'meat', mx=H, seg=12, rings=6)


def pauldron(m, C, sx, cracked=False):
    """A layered spiked pauldron on the chest frame, tilted out and down over the shoulder."""
    M = C @ trans(sx * 0.4, 0.0, -0.03) @ roty(sx * 0.38)
    m.ball((0, 0, 0.05), (0.22, 0.2, 0.1), 'knight_iron', mx=M, seg=18, rings=10)
    m.ball((0, 0, -0.01), (0.25, 0.22, 0.07), 'knight_rust', mx=M, seg=18, rings=8)
    m.ball((0, 0, -0.07), (0.24, 0.21, 0.06), 'knight_dark', mx=M, seg=18, rings=8)
    m.ball((0, 0, 0.1), (0.14, 0.13, 0.04), 'knight_iron', mx=M, seg=14, rings=6)
    m.cyl((0, 0, 0.1), (0, 0, 0.3), 0.05, 0.0, 'knight_dark', seg=8, mx=M)                      # the spike
    for a in (-0.7, 0.0, 0.7):
        m.ball((0.2 * math.sin(a), -0.17 * math.cos(a), 0.02), (0.016, 0.016, 0.016), 'knight_iron', mx=M, seg=6, rings=4)
    if cracked:
        m.tube([(-0.05, -0.2, 0.1), (0.03, -0.12, 0.13), (0.0, -0.05, 0.15), (0.09, 0.05, 0.14)], 0.009, 'knight_crack', seg=5, mx=M, cap=False)


def front_y(x, z):
    """The breastplate's front surface (spine frame): y for a given x, z."""
    q = 1.0 - (x / 0.3) ** 2 - ((z - 0.38) / 0.27) ** 2
    return -0.02 - 0.21 * math.sqrt(max(q, 0.0)) - 0.004


def torso(m, F, cracked=False):
    S, P = F['spine'], F['pelvis']
    m.ball((0, 0.0, 0.0), (0.25, 0.2, 0.14), 'knight_dark', mx=S)                           # hips in mail
    for z, mt in ((0.11, 'knight_iron'), (0.04, 'knight_rust'), (-0.03, 'knight_iron')):    # faulds
        m.ball((0, -0.01, z), (0.29, 0.22, 0.05), mt, mx=S, seg=22, rings=8)
    m.ball((0, 0.0, 0.17), (0.29, 0.21, 0.04), 'knight_leather', mx=S, seg=22, rings=8)     # belt
    m.ball((0, -0.205, 0.17), (0.055, 0.025, 0.045), 'knight_iron', mx=S, seg=10, rings=6)  # buckle
    for sx in (-1, 1):                                                                       # tassets over the thighs
        m.ball((sx * 0.15, -0.2, -0.1), (0.13, 0.05, 0.19), 'knight_iron', mx=S, seg=14, rings=8)
    m.ball((0, 0.1, 0.38), (0.28, 0.17, 0.25), 'knight_dark', mx=S)                         # back plate
    m.ball((0, -0.02, 0.38), (0.3, 0.21, 0.27), 'knight_iron', mx=S, seg=24, rings=14)      # breastplate
    m.tube([(0, front_y(0, z) - 0.006, z) for z in (0.17, 0.27, 0.37, 0.47, 0.56)], 0.02, 'knight_dark', seg=6, mx=S, cap=False)  # centre ridge
    for z in (0.52, 0.22):                                                                   # rivets
        for x in (-0.15, 0.15):
            m.ball((x, front_y(x, z) - 0.004, z), (0.016, 0.014, 0.016), 'knight_rust', mx=S, seg=6, rings=4)
    # the tabard: a tattered red cloth hanging from the belt, front and back
    ragged = [(-0.12, 0.1), (0.12, 0.1), (0.12, -0.33), (0.07, -0.25), (0.03, -0.38), (-0.03, -0.27), (-0.075, -0.4), (-0.12, -0.3)]
    m.prism(ragged, -0.245, -0.225, 'knight_cloth', mx=P, bevel=0.004)
    m.prism([(x * 0.9, z) for x, z in ragged], 0.205, 0.225, 'knight_cloth', mx=P, bevel=0.004)
    if cracked:
        cx, cz = -0.08, 0.37
        m.ball((cx, front_y(cx, cz) + 0.01, cz), (0.15, 0.055, 0.16), 'knight_rot', mx=S, seg=14, rings=8)       # flesh pushing through
        for dz in (-0.07, -0.01, 0.05):                                                                       # ribs
            m.tube([(x, front_y(x, cz + dz) - 0.052, cz + dz) for x in (-0.18, -0.12, -0.05, 0.02)], 0.014, 'bone', seg=6, mx=S, cap=False)
        ring = [(-0.2, 0.34), (-0.17, 0.45), (-0.08, 0.5), (0.0, 0.45), (0.04, 0.35), (0.0, 0.27), (-0.1, 0.23), (-0.19, 0.27), (-0.2, 0.34)]
        m.tube([(x, front_y(x, z) - 0.02, z) for x, z in ring], 0.013, 'knight_crack', seg=5, mx=S, cap=False)    # the broken edge
        for pts in (((-0.17, 0.45), (-0.23, 0.53), (-0.2, 0.6)), ((0.04, 0.38), (0.13, 0.42), (0.2, 0.37), (0.24, 0.3)),
                    ((0.0, 0.27), (0.07, 0.2), (0.03, 0.12)), ((-0.19, 0.27), (-0.26, 0.2), (-0.23, 0.12))):
            m.tube([(x, front_y(x, z) - 0.008, z) for x, z in pts], 0.009, 'knight_crack', seg=5, mx=S, cap=False)
        for x, z, dx, dz in ((-0.18, 0.46, -0.07, 0.07), (0.03, 0.44, 0.07, 0.07), (0.03, 0.29, 0.08, -0.05), (-0.17, 0.25, -0.08, -0.06)):
            a = (x, front_y(x, z) - 0.01, z)
            m.cyl(a, (x + dx, a[1] - 0.07, z + dz), 0.045, 0.0, 'knight_rust', seg=5, mx=S)               # bent plate edges
        m.tube([(-0.06, front_y(-0.06, 0.26) - 0.02, 0.26), (-0.065, front_y(-0.06, 0.2) - 0.01, 0.2), (-0.06, front_y(-0.06, 0.12) - 0.01, 0.12)],
               0.016, 'knight_blood', seg=6, mx=S)


def neck(m, F, cracked=False):
    C = F['chest']
    m.lathe([(-0.03, 0.17), (0.0, 0.2), (0.07, 0.195), (0.1, 0.15)], 'knight_dark', mx=C, seg=20, smooth=60.0, cap=False)   # gorget
    m.capsule(at(C, 0, 0, 0.0), at(F['head'], 0, 0, 0.05), 0.1, 0.09, 'knight_dark')


def stump(m, F):
    """The neck, torn open inside the gorget: dark red meat and a bone."""
    C = F['chest']
    m.ball(at(C, 0, 0, 0.1), (0.15, 0.15, 0.04), 'meat')
    m.capsule(at(C, 0, 0, 0.08), at(C, 0, 0, 0.2), 0.04, 0.035, 'bone')
    m.ball(at(C, 0.05, -0.05, 0.12), (0.05, 0.05, 0.035), 'knight_blood')


def arm(m, F, side, cut=False, fist=True):
    """A plate arm: rerebrace, couter, vambrace, a gauntlet fist (a cut at the shoulder for the gib)."""
    sh, el, ha = F['sh_' + side], F['elbow_' + side], F['hand_' + side]
    if cut:
        m.cyl(at(sh), at(el), 0.105, 0.09, 'knight_iron', seg=14)
        m.ball(at(sh), (0.1, 0.1, 0.04), 'meat')
        m.capsule(at(sh, 0, 0, -0.02), at(sh, 0, 0, 0.1), 0.03, 0.026, 'bone')
        m.ball(at(sh, 0.04, -0.05, 0.02), (0.04, 0.04, 0.025), 'knight_blood')
    else:
        m.capsule(at(sh), at(el), 0.105, 0.09, 'knight_iron')
    m.ball(at(el), (0.11, 0.11, 0.11), 'knight_dark')
    m.cyl(at(el, 0, -0.08, 0.0), at(el, 0, -0.17, 0.0), 0.04, 0.0, 'knight_dark', seg=6)           # elbow spike
    m.capsule(at(el), at(ha), 0.09, 0.08, 'knight_iron')
    m.capsule(at(el, 0, 0, -0.16), at(ha, 0, 0, 0.02), 0.098, 0.092, 'knight_dark')                # flared cuff
    m.ball(at(ha, 0, 0, -0.06), (0.095, 0.08, 0.1), 'knight_dark')                                   # the gauntlet
    for x in (-0.05, 0.0, 0.05):
        m.ball(at(ha, x, -0.06, -0.09), (0.028, 0.03, 0.04), 'knight_iron', seg=8, rings=5)


def leg(m, F, side, cut=False):
    """A plate leg: cuisse, knee cop with a spike, greave, a pointed sabaton."""
    hip, kn, an = F['hip_' + side], F['knee_' + side], F['ankle_' + side]
    if cut:
        m.cyl(at(hip), at(kn), 0.125, 0.105, 'knight_iron', seg=14)
        m.ball(at(hip), (0.125, 0.125, 0.04), 'meat')
        m.capsule(at(hip, 0, 0, -0.02), at(hip, 0, 0, 0.1), 0.035, 0.03, 'bone')
        m.ball(at(hip, -0.05, -0.05, 0.02), (0.04, 0.04, 0.025), 'knight_blood')
    else:
        m.capsule(at(hip), at(kn), 0.125, 0.105, 'knight_iron')
    m.ball(at(kn, 0, -0.03, 0), (0.12, 0.12, 0.12), 'knight_dark')
    m.cyl(at(kn, 0, -0.1, 0.0), at(kn, 0, -0.2, 0.0), 0.045, 0.0, 'knight_dark', seg=6)
    m.capsule(at(kn), at(an), 0.1, 0.085, 'knight_iron')
    m.capsule(at(kn, 0, 0, -0.18), at(an, 0, 0, 0.12), 0.105, 0.095, 'knight_dark')                  # shin guard band
    R = an.to_3x3().to_4x4()
    m.ball(at(an, 0, -0.07, -0.04), (0.09, 0.15, 0.065), 'knight_dark', rot=R)                       # the boot
    m.ball(at(an, 0, -0.2, -0.05), (0.06, 0.12, 0.05), 'knight_iron', rot=R)                         # pointed toecap
    m.cyl(at(an, 0, -0.27, -0.05), at(an, 0, -0.38, -0.055), 0.04, 0.0, 'knight_iron', seg=6)


def sword(m, grip, d):
    """A rusty broadsword with its grip at `grip` and its blade along the direction d; the flat of the blade faces the camera."""
    z = Vector(d).normalized()
    ref = Vector((0.0, -1.0, 0.0))
    x = z.cross(ref)
    if x.length < 0.3:
        x = z.cross(Vector((1.0, 0.0, 0.0)))
    x.normalize()
    y = z.cross(x)
    R = Matrix((x, y, z)).transposed().to_4x4()
    M = trans(*grip) @ R
    m.cyl((0, 0, -0.14), (0, 0, 0.07), 0.03, 0.03, 'knight_leather', seg=8, mx=M)                   # grip
    m.ball((0, 0, -0.16), (0.045, 0.045, 0.045), 'knight_iron', mx=M, seg=8, rings=6)                # pommel
    m.box(-0.16, 0.16, -0.028, 0.028, 0.07, 0.115, 'knight_dark', mx=M, bevel=0.008)                 # crossguard
    for sx in (-1, 1):
        m.ball((sx * 0.16, 0, 0.092), (0.03, 0.03, 0.03), 'knight_dark', mx=M, seg=8, rings=6)
    m.slab([(-0.065, 0.115), (0.065, 0.115), (0.06, 0.8), (0.0, 0.98), (-0.06, 0.8)], -0.014, 0.014, 'knight_blade', mx=M, bevel=0.004)
    m.box(-0.012, 0.012, -0.018, 0.018, 0.15, 0.75, 'knight_dark', mx=M)                            # the fuller
    for z0, side in ((0.35, 1), (0.55, -1), (0.7, 1)):                                              # nicks and rust flakes on the edge
        m.box(side * 0.045, side * 0.066, -0.012, 0.012, z0, z0 + 0.05, 'knight_rust', mx=M)


def wire_shield(F, p):
    """The shield's world matrix, hung off the root: it leans toward the camera more as the body lunges."""
    ex = max(0.0, p.lean - 0.1)
    return F['root'] @ trans(SH_C[0] + p.shx, SH_C[1] - 0.45 * ex, SH_C[2] - 0.1 * ex + p.shz) @ rotx(-0.2 + 0.6 * ex) @ roty(0.6 * p.roll)


def body(p, d, bare=False, shield_on=True, parts=('head', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'), stumped=False, skull=False):
    p = planted(SK, p)
    F = SK.frames(p)
    m = Mesh('knight')
    if 'torso' in parts:
        torso(m, F, cracked=bare)
        neck(m, F)
        if stumped:
            stump(m, F)
        pauldron(m, F['chest'], -1, cracked=bare)
        pauldron(m, F['chest'], 1)
    if 'head' in parts:
        helm(m, F, cracked=bare)
    for s in ('l', 'r'):
        if 'arm_' + s in parts:
            arm(m, F, s)
        if 'leg_' + s in parts:
            leg(m, F, s)
    if 'arm_r' in parts:
        sword(m, at(F['hand_r'], 0, 0, -0.08), d)
    if shield_on:
        shield(m, wire_shield(F, p))
    return m


# ------------------------------------------------------------------------------------------------ poses

def march(t, bare=False):
    """A slow, heavy march: upright, short steps, the sword arm out to the side holding the blade up, the shield arm tucked in
    behind the shield (or, once the shield is gone, swinging a bare gauntlet and lurching more)."""
    p = walk(t, stride=0.34, knee=0.55, arm=0.0, bob=0.035, lean=0.16 if bare else 0.1, roll=0.05)
    a = 2 * PI * t
    s = math.sin(a)
    p['head_pitch'] = -0.7
    p['head_yaw'] = 0.08 * math.sin(a * 0.5)
    p['head_roll'] = 0.06 * s
    p['hip_out_l'] = p['hip_out_r'] = 0.05
    p['sh_r'] = 1.0 + 0.07 * s
    p['sh_out_r'] = 0.5
    p['elbow_r'] = 1.2
    if bare:
        p['sh_l'] = 1.55 + 0.3 * math.sin(a + 2.0)       # the freed arm swings out in front: raised so it reads from above
        p['sh_out_l'] = 0.38
        p['elbow_l'] = 0.6
        p['roll'] = 0.09 * s
    else:
        p['sh_l'] = 0.75
        p['sh_out_l'] = 0.1
        p['elbow_l'] = 1.2
    p['shx'] = 0.0
    p['shz'] = 0.012 * math.cos(2 * a)
    return p


def march_dir(t):
    """Where the blade points on the march: up and out to the right, swaying a little."""
    s = math.sin(2 * PI * t)
    return (0.5 + 0.07 * s, -0.3, 0.8)


STRIKE = [  # lean, sword shoulder, elbow, blade direction
    (-0.02, 2.7, 0.85, (0.15, 0.55, 1.0)),
    (0.3, 2.15, 0.55, (0.55, -0.45, 0.8)),
    (0.5, 1.5, 0.15, (0.5, -0.75, -0.45)),
    (0.25, 1.4, 0.8, (0.55, -0.4, 0.5)),
]


def strike(i, bare=False):
    """The chop: sword up and back (0), swinging down (1), hitting in front (2), pulling back (3); the shield stays up."""
    lean, sh, el, d = STRIKE[i]
    p = Pose(lean=lean, hip_l=0.3 * lean + 0.15, hip_r=-0.3 * lean + 0.2, knee_l=0.45, knee_r=0.5, hip_out_l=0.08, hip_out_r=0.08,
             head_pitch=-0.55 - 0.7 * lean, sh_r=sh, sh_out_r=0.45, elbow_r=el, jaw=0.0)
    if bare:
        p.update(sh_l=1.0 + 0.9 * lean, sh_out_l=0.4, elbow_l=0.5 + 0.2 * (1 - lean))
    else:
        p.update(sh_l=0.75, sh_out_l=0.1, elbow_l=1.2)
    p['shx'] = 0.0
    p['shz'] = 0.0
    return p, d


# ------------------------------------------------------------------------------------------------ build

def build(ctx):
    ctx.anim('knight_walk', 8, lambda i: body(march(i / 8), march_dir(i / 8)))
    ctx.anim('knight_bare', 8, lambda i: body(march(i / 8, True), march_dir(i / 8), bare=True, shield_on=False))

    def atk(i, bare):
        p, d = strike(i, bare)
        return body(p, d, bare=bare, shield_on=not bare)
    ctx.anim('knight_attack', 4, lambda i: atk(i, False))
    ctx.anim('knight_bare_attack', 4, lambda i: atk(i, True))

    hx = hy = hyy = sx = sy = 0.0
    for i in range(8):
        p = planted(SK, march(i / 8))
        F = SK.frames(p)
        c = F['head'] @ trans(0, 0, HELM_CZ)
        hx += c.translation.x / 8
        hy += c.translation.z / 8
        hyy += c.translation.y / 8
        q = wire_shield(F, p).translation
        sx += q.x / 8
        sy += q.y / 8
        sz = q.z / 8 if i == 0 else sz + q.z / 8
    ctx.anchor('head', 'knight', (hx, hyy, hy))
    ctx.value('size', 'knight_head', round(0.48 * bl.UNITS_PER_M, 1))
    ctx.anchor('shield', 'knight', (sx, sy, sz))
    # on screen the shield is foreshortened by the 35 degree camera and leaned back a little
    ctx.value('shieldsize', 'knight', [round(SH_W * bl.UNITS_PER_M, 1), round(SH_H * math.cos(math.radians(bl.ELEV) - 0.2) * bl.UNITS_PER_M, 1)])

    # gibs: built around the origin so the pivot is their middle
    F0 = SK.frames(Pose())
    tilt = rotx(-1.3)
    g = Mesh('head')
    helm(g, F0, cracked=True, mx=tilt @ trans(0, 0, -HELM_CZ), skull=True)
    ctx.one('knight_head', g)

    a = Mesh('arm')
    Fa = SK.frames(Pose(sh_l=0.0))
    arm(a, Fa, 'l', cut=True)
    a.transform(trans(*(-v for v in at(Fa['elbow_l']))))
    a.transform(roty(PI / 2))
    a.transform(rotz(-0.8))
    ctx.one('knight_arm', a)

    lg = Mesh('leg')
    leg(lg, F0, 'r', cut=True)
    lg.transform(trans(*(-v for v in at(F0['knee_r']))))
    lg.transform(roty(-PI / 2))
    lg.transform(rotz(0.8))
    ctx.one('knight_leg', lg)

    tr = Mesh('torso')
    torso(tr, F0, cracked=True)
    neck(tr, F0)
    stump(tr, F0)
    pauldron(tr, F0['chest'], -1, cracked=True)
    pauldron(tr, F0['chest'], 1)
    for sx_ in (-1, 1):
        tr.ball(at(F0['sh_' + ('l' if sx_ < 0 else 'r')], 0, 0, -0.04), (0.09, 0.09, 0.07), 'meat')
    tr.ball(at(F0['spine'], 0, -0.05, -0.02), (0.22, 0.12, 0.05), 'guts')
    tr.transform(trans(0, 0, -at(F0['spine'], 0, 0, 0.4)[2]))
    tr.transform(rotx(-PI / 2 + 0.3))
    ctx.one('knight_torso', tr)

    sh = Mesh('shield')
    shield(sh, rotx(-0.5), cracked=True)
    ctx.one('knight_shield', sh)

    for k, pts, fm in ((0, [(-0.22, 0.14), (-0.1, 0.22), (0.02, 0.17), (0.13, 0.22), (0.21, 0.1), (0.12, 0.01), (0.18, -0.1), (0.05, -0.2),
                           (-0.06, -0.1), (-0.15, -0.2), (-0.24, -0.08), (-0.19, 0.02)], 'skull'),
                       (1, [(-0.25, 0.1), (-0.12, 0.17), (0.0, 0.1), (0.14, 0.16), (0.26, 0.08), (0.2, -0.04), (0.24, -0.14), (0.1, -0.17),
                            (0.0, -0.1), (-0.12, -0.17), (-0.22, -0.1), (-0.2, 0.0)], 'strap')):
        sm = Mesh('shard')
        sm.prism(pts, -0.01, 0.07, 'knight_dark', bevel=0.008)
        inner = [(x * 0.84, z * 0.84) for x, z in pts]
        sm.prism(inner, -0.07, 0.0, 'knight_iron', bevel=0.008)
        if fm == 'skull':
            sm.ball((0.06, -0.085, -0.02), (0.14, 0.03, 0.11), 'knight_cloth', seg=14, rings=6)                 # a scrap of the crimson roundel
            sm.ball((-0.02, -0.115, 0.03), (0.09, 0.045, 0.075), 'bone', seg=14, rings=8)                      # and a piece of the skull
            sm.ball((-0.045, -0.15, 0.045), (0.032, 0.02, 0.036), 'knight_crack', seg=8, rings=5)
            for x in (-0.05, -0.02, 0.01):
                sm.ball((x, -0.15, -0.02), (0.008, 0.012, 0.03), 'knight_crack', seg=6, rings=4)
        else:
            sm.box(-0.22, 0.2, -0.09, -0.065, -0.04, 0.03, 'knight_dark', bevel=0.006)
            for x in (-0.16, 0.14):
                sm.ball((x, -0.085, -0.005), (0.02, 0.014, 0.02), 'knight_iron', seg=6, rings=4)
        sm.transform(rotx(-0.45))
        sm.transform(rotz(0.5 - 1.1 * k))
        ctx.one('knight_shard_%d' % k, sm)

    pl = Mesh('plate')                                  # a torn-off breastplate piece: bent, rusty, jagged edge, rivets
    pts = [(-0.2, 0.2), (-0.06, 0.24), (0.07, 0.21), (0.2, 0.22), (0.22, 0.05), (0.17, -0.1), (0.2, -0.2), (0.06, -0.14), (-0.04, -0.23),
           (-0.15, -0.14), (-0.22, -0.2), (-0.19, -0.02)]
    pl.prism(pts, -0.01, 0.05, 'knight_dark', bevel=0.008)
    pl.prism([(x * 0.86, z * 0.86) for x, z in pts], -0.05, 0.0, 'knight_iron', bevel=0.008)
    pl.prism([(x * 0.55 + 0.02, z * 0.5 + 0.03) for x, z in pts], -0.065, -0.04, 'knight_rust', bevel=0.006)
    for x, z in ((-0.12, 0.13), (0.13, 0.14), (0.1, -0.06), (-0.12, -0.06)):
        pl.ball((x, -0.06, z), (0.02, 0.016, 0.02), 'knight_iron', seg=6, rings=4)
    for v in pl.bm.verts:                               # bowed like a breastplate, then dented
        v.co.y += 1.1 * v.co.x ** 2 + 0.6 * v.co.z ** 2
    pl.warp(0.02, 3.0, 2.0)
    pl.transform(rotx(-0.5))
    pl.transform(rotz(0.3))
    ctx.one('knight_plate', pl)
