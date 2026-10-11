"""Shared pieces of the spirits lane (skitter, mourner, lampwight): materials, a skull, claw hands, an iron soul lantern, a hood
shell, tapering rag ribbons and the gradient images that make rags fade from dark cloth to glowing soul light.

Everything here builds into a `Mesh` in the caller's frame (the model faces south, -Y, stands on z = 0). Local helpers such as
`skull` take a matrix `mx` that places their own frame (origin and axes) in the caller's.

Because a frame's objects are moved around a render sheet, materials must not depend on world height (`fade`, `dirt`); gradients
along a strand come from UV image textures (`rag_images`) instead.
"""
import math

import numpy as np
from mathutils import Vector, Matrix

import bl
import mats
from bl import Mesh, trans, rotx, roty, rotz, scale

PI = math.pi

# ------------------------------------------------------------------------------------------------ materials

d = mats.define
# skitterskull: violet-black chitin, aged bone, teal soul light
d('sp_chitin', base='#241f3e', base2='#4a3f7c', pattern='noise', pscale=10, pamt=0.85, gloss=0.55, wear=0.8, bump=0.35,
  bscale=70, seed=41, bevel=0.006)
d('sp_chitin_hi', base='#33295a', base2='#6a5aa8', pattern='noise', pscale=16, pamt=0.75, gloss=0.62, wear=0.9, bump=0.25,
  bscale=90, seed=42, bevel=0.005)
d('sp_chitin_dark', base='#15121f', base2='#2c2548', pattern='noise', pscale=8, pamt=0.7, gloss=0.45, wear=0.6, bump=0.3,
  seed=43, bevel=0.006)
d('sp_bone', base='#ddd2b8', base2='#8f836a', pattern='noise', pscale=14, pamt=0.55, gloss=0.22, wear=0.7, seed=44, bevel=0.004)
d('sp_skull', base='#d8ceb2', base2='#6c6150', pattern='cracks', pscale=11, pamt=0.85, gloss=0.2, wear=0.7, seed=45,
  bevel=0.004)
d('sp_socket', base='#06070e', bevel=0.003)
d('sp_tooth', base='#f0e6c8', base2='#b3a584', pattern='noise', pscale=20, pamt=0.5, gloss=0.35, bevel=0.002, seed=46)
d('sp_eye', base='#7ff3ff', emit=1.0, bevel=0.003)
d('sp_eye_teal', base='#3fe0c5', emit=1.0, bevel=0.003)
d('sp_vent', base='#3fe0c5', base2='#7ff3ff', pattern='noise', pscale=20, pamt=0.6, emit=1.0, bevel=0.003, seed=47)
# spectral cloth and flesh of the dead: dark violet rags, pale blue ghost light
d('sp_hood', base='#1b1a32', base2='#38356a', pattern='weave', pscale=3, pamt=0.85, seed=51, bump=0.2, bevel=0.01)
d('sp_hood_in', base='#07080f', base2='#10121f', pattern='noise', pscale=6, pamt=0.5, seed=52, bevel=0.01)
d('sp_robe', base='#201e3a', base2='#423f7a', pattern='weave', pscale=3, pamt=0.8, seed=53, bump=0.2, bevel=0.012)
d('sp_robe_hi', base='#2c2a54', base2='#544f98', pattern='weave', pscale=4, pamt=0.7, seed=54, bump=0.2, bevel=0.01)
d('sp_rag', base='#1b1a2e', base2='#34406e', pattern='weave', pscale=3, pamt=0.8, seed=55, bevel=0.006, tex='sp_rag_fade',
  tex_emit=0.9)
d('sp_rag_teal', base='#16192b', base2='#2b3f66', pattern='weave', pscale=3, pamt=0.8, seed=56, bevel=0.006,
  tex='sp_rag_teal', tex_emit=0.9)
d('sp_rag_dim', base='#1b1a2e', base2='#34406e', pattern='weave', pscale=3, pamt=0.8, seed=57, bevel=0.006, tex='sp_rag_fade_dim',
  tex_emit=0.9)
d('sp_rag_dim_teal', base='#16192b', base2='#2b3f66', pattern='weave', pscale=3, pamt=0.8, seed=58, bevel=0.006,
  tex='sp_rag_teal_dim', tex_emit=0.9)
d('sp_spectral', base='#5f93b8', base2='#b6e6f6', pattern='noise', pscale=7, pamt=0.7, emit=0.45, gloss=0.15, seed=57,
  bevel=0.006)
d('sp_ghostflesh', base='#4b6f98', base2='#9fd2ec', pattern='noise', pscale=9, pamt=0.7, emit=0.55, gloss=0.2, seed=58,
  bevel=0.004)
d('sp_face', base='#b6f1f6', base2='#effffe', pattern='noise', pscale=14, pamt=0.5, emit=0.45, gloss=0.2, seed=59, bevel=0.01)
d('sp_trim', base='#7ff3ff', base2='#3fe0c5', pattern='noise', pscale=16, pamt=0.4, emit=1.0, bevel=0.003, seed=60)
d('sp_claw', base='#b4cfdb', base2='#6f94a8', pattern='noise', pscale=16, pamt=0.5, emit=0.3, gloss=0.35, seed=61,
  bevel=0.003)
d('sp_claw_bone', base='#d9cfb4', base2='#8a7e66', pattern='noise', pscale=16, pamt=0.5, gloss=0.3, seed=62, bevel=0.003)
# iron lanterns and chains
d('sp_iron', base='#1f2433', base2='#445068', pattern='noise', pscale=9, pamt=0.7, gloss=0.55, wear=0.9, bump=0.2, seed=63,
  bevel=0.006)
d('sp_iron_rust', base='#2a2227', base2='#5b4a46', pattern='noise', pscale=8, pamt=0.7, gloss=0.35, wear=0.8, bump=0.3,
  seed=64, bevel=0.006)
d('sp_flame', base='#9ff8ff', base2='#e8ffff', pattern='noise', pscale=10, pamt=0.5, emit=1.0, bevel=0.004, seed=65)
d('sp_trim_teal', base='#3fe0c5', base2='#7ff3ff', pattern='noise', pscale=16, pamt=0.4, emit=1.0, bevel=0.003, seed=67)
d('sp_halo', base='#3fe0c5', base2='#7ff3ff', pattern='noise', pscale=8, pamt=0.6, emit=0.75, bevel=0.01, seed=66)


# ------------------------------------------------------------------------------------------------ images

def _gradient(w, h, stops, jitter=0.25, seed=0, power=1.0):
    """RGBA float image for a tube's UV: columns = u (around), rows = v (along; array row 0 is v = 1, the strand's tip).
    stops = [(v, (r, g, b), alpha), ...]: colour and opacity of the glow along the strand. Streaky across u."""
    rng = np.random.RandomState(seed)
    streak = rng.rand(w)
    streak = (streak + np.roll(streak, 1) + np.roll(streak, -1)) / 3.0
    img = np.zeros((h, w, 4), np.float32)
    vs = np.linspace(1.0, 0.0, h)          # row 0 = v 1
    xs = [s[0] for s in stops]
    for r, v in enumerate(vs):
        col = [np.interp(v, xs, [s[1][c] for s in stops]) for c in range(3)]
        a = float(np.interp(v, xs, [s[2] for s in stops])) ** power
        img[r, :, :3] = col
        img[r, :, 3] = np.clip(a * (1.0 - jitter + jitter * 2.0 * streak), 0.0, 1.0)
    return img


def register_image(key, rgba):
    """Like mats.image, but sets the colour space and alpha mode BEFORE the pixels (changing them afterwards makes Blender throw
    away a generated image's pixels, which is what mats.image does: its textures come out black)."""
    import bpy
    rgba = np.asarray(rgba, np.float32)
    h, w = rgba.shape[:2]
    img = bpy.data.images.get('tex_' + key) or bpy.data.images.new('tex_' + key, w, h, alpha=True, float_buffer=False)
    if img.size[0] != w or img.size[1] != h:
        img.scale(w, h)
    img.colorspace_settings.name = 'sRGB'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    img.update()
    mats._images[key] = img
    return img


def rag_images():
    """Register the strand gradient images (call at the start of build(ctx): the scene's images are reset per module)."""
    register_image('sp_rag_fade', _gradient(16, 48, [(0.0, (0.2, 0.3, 0.55), 0.0), (0.35, (0.3, 0.5, 0.78), 0.0),
                                                     (0.7, (0.55, 0.82, 0.96), 0.55), (1.0, (0.8, 0.97, 1.0), 1.0)], seed=3))
    register_image('sp_rag_fade_dim', _gradient(16, 48, [(0.0, (0.2, 0.3, 0.55), 0.0), (0.7, (0.3, 0.5, 0.78), 0.0),
                                                         (0.9, (0.55, 0.82, 0.96), 0.4), (1.0, (0.8, 0.97, 1.0), 0.9)], seed=9))
    register_image('sp_rag_teal_dim', _gradient(16, 48, [(0.0, (0.15, 0.4, 0.5), 0.0), (0.72, (0.2, 0.6, 0.65), 0.0),
                                                         (0.9, (0.3, 0.85, 0.8), 0.4), (1.0, (0.55, 1.0, 0.95), 0.9)], seed=11))
    register_image('sp_rag_teal', _gradient(16, 48, [(0.0, (0.15, 0.4, 0.5), 0.0), (0.5, (0.2, 0.6, 0.65), 0.0),
                                                     (0.78, (0.3, 0.85, 0.8), 0.45), (1.0, (0.55, 1.0, 0.95), 1.0)], seed=5))


# ------------------------------------------------------------------------------------------------ small geometry helpers

def V(p):
    return Vector(p)


def ribbon(m, pts, w, mat, up=None, flat=0.28, seg=6, taper=0.9, power=1.2, w_min=0.003):
    """A tapering rag: a flat tube along `pts` (wide across `up`), narrowing to a point."""
    n = len(pts)
    rad = [w * (1.0 - taper * (i / (n - 1)) ** power) + w_min * (i / (n - 1)) for i in range(n)]
    rad[-1] = max(rad[-1] * 0.4, 0.0015)
    m.tube(pts, rad, mat, seg=seg, flat=flat, up=up, cap=True, smooth=70)


def spike(m, base, tip, r, mat, seg=6, mx=None):
    m.cyl(base, tip, r, 0.0, mat, seg=seg, mx=mx)


def curved_spike(m, pts, r, mat, seg=6, mx=None):
    """A curved horn or hook along `pts`, tapering to a point."""
    n = len(pts)
    rad = [r * (1.0 - (i / (n - 1))) ** 0.8 + 0.0008 for i in range(n)]
    m.tube(pts, rad, mat, seg=seg, mx=mx, cap=True, smooth=70)


# ------------------------------------------------------------------------------------------------ the skull

def skull(m, mx, jaw=0.2, glow=1.0, eye_mat='sp_eye_teal', jaw_slack=0.0):
    """A cracked human skull with deep sockets lit by soul light, a hinged jaw and fangs. Local frame: origin at the middle of the
    cranium, the face toward -Y, up +Z; about 0.18 m wide. `jaw` opens the mandible (radians), `glow` scales the eye light."""
    B, S, T = 'sp_skull', 'sp_socket', 'sp_tooth'
    m.ball((0, 0.014, 0.016), (0.09, 0.102, 0.092), B, mx=mx, seg=20, rings=12)                 # cranium
    m.ball((0, -0.046, 0.034), (0.074, 0.062, 0.056), B, mx=mx, seg=16, rings=9)                # forehead
    m.ball((0, -0.062, -0.04), (0.058, 0.048, 0.06), B, mx=mx, seg=16, rings=9)                 # maxilla
    m.ball((0, 0.06, -0.01), (0.07, 0.05, 0.07), 'sp_bone', mx=mx, seg=12, rings=7)             # back of the skull
    for sx in (-1, 1):
        m.ball((sx * 0.07, -0.038, -0.03), (0.021, 0.036, 0.026), B, mx=mx, seg=10, rings=6)    # cheekbone
        m.capsule((sx * 0.012, -0.078, 0.036), (sx * 0.074, -0.06, 0.03), 0.016, 0.014, B, mx=mx, seg=8, rings=3)   # brow
        m.ball((sx * 0.036, -0.082, 0.004), (0.029, 0.014, 0.032), S, mx=mx, seg=12, rings=7)    # socket
        g = max(glow, 0.05)
        m.ball((sx * 0.036, -0.092, 0.003), (0.018 * g ** 0.5, 0.011, 0.022 * g ** 0.5), eye_mat, mx=mx, seg=10, rings=6)
    m.ball((0, -0.106, -0.04), (0.013, 0.008, 0.021), S, mx=mx, seg=8, rings=5)                  # nasal cavity
    # a split in the cranium: a dark crack running from the forehead round the right of the vault
    c0, r0 = Vector((0, 0.014, 0.016)), (0.09, 0.102, 0.092)
    cp = []
    for el, az in ((80, 8), (72, 22), (63, 18), (55, 34), (44, 30), (34, 46), (22, 44)):
        e, a = math.radians(el), math.radians(az)
        cp.append(c0 + Vector((r0[0] * math.cos(e) * math.sin(a), -r0[1] * math.cos(e) * math.cos(a), r0[2] * math.sin(e))) * 1.004)
    m.tube(cp, [0.0034, 0.0030, 0.0030, 0.0026, 0.0022, 0.0018, 0.001], S, seg=4, mx=mx, smooth=0)
    # upper teeth and fangs
    for i in range(8):
        x = (i - 3.5) * 0.0105
        y = -0.1 - 0.012 * (1.0 - abs(x) / 0.04)
        m.box(x - 0.0042, x + 0.0042, y - 0.004, y + 0.004, -0.103, -0.082, T, mx=mx, bevel=0.0015)
    for sx in (-1, 1):
        spike(m, (sx * 0.03, -0.1, -0.082), (sx * 0.03, -0.108, -0.142), 0.0085, T, seg=6, mx=mx)
    # the hinged jaw: two rami from the hinge to a chin, with teeth and rising fangs; opens about the hinge axis (x)
    H = trans(0, -0.002, -0.066) @ rotx(jaw + jaw_slack)
    arm = lambda sx: [(sx * 0.058, 0.0, 0.0), (sx * 0.056, -0.03, -0.034), (sx * 0.042, -0.068, -0.05), (sx * 0.016, -0.088, -0.05)]
    for sx in (-1, 1):
        m.tube(arm(sx), [0.014, 0.013, 0.012, 0.011], B, seg=8, mx=mx @ H, smooth=60)
        m.ball((sx * 0.058, 0.0, 0.0), 0.016, 'sp_bone', mx=mx @ H, seg=8, rings=5)
        m.capsule((sx * 0.057, 0.0, 0.0), (sx * 0.06, 0.003, 0.05), 0.013, 0.01, 'sp_bone', mx=mx @ H, seg=6, rings=2)   # coronoid
    m.ball((0, -0.088, -0.05), (0.02, 0.012, 0.012), B, mx=mx @ H, seg=8, rings=5)
    for i in range(7):
        t = i / 6.0
        x = (t - 0.5) * 0.075
        y = -0.086 + 0.026 * (abs(t - 0.5) * 2) ** 1.5 * 0.9
        m.box(x - 0.0036, x + 0.0036, y - 0.004, y + 0.004, -0.046, -0.028, T, mx=mx @ H, bevel=0.0012)
    for sx in (-1, 1):
        spike(m, (sx * 0.024, -0.092, -0.046), (sx * 0.026, -0.1, 0.006), 0.0075, T, seg=6, mx=mx @ H)


# ------------------------------------------------------------------------------------------------ claw hands

def _basis(f, p_hint):
    f = Vector(f).normalized()
    p = Vector(p_hint) - f * Vector(p_hint).dot(f)
    if p.length < 1e-5:
        p = f.orthogonal()
    p.normalize()
    s = f.cross(p).normalized()
    return f, p, s


def claw_hand(m, wrist, fdir, palm, spread=0.35, curl=0.5, size=1.0, mat='sp_claw', claw='sp_claw_bone', fingers=4):
    """A long-fingered clawed hand at `wrist`, fingers pointing along `fdir`, palm facing `palm` (a direction), fingers fanned by
    `spread` (radians between neighbours) and curled toward the palm by `curl` (0 open .. 1 hooked)."""
    wrist = Vector(wrist)
    f, p, s = _basis(fdir, palm)
    m.ball(wrist + f * 0.045 * size, (0.034 * size, 0.034 * size, 0.034 * size), mat, seg=8, rings=5, rot=None)
    lens = [0.075, 0.062, 0.05]
    n = fingers
    for k in range(n):
        o = (k - (n - 1) / 2.0)
        fan = o * spread * 0.55
        base = wrist + f * 0.06 * size + s * (o * 0.017 * size) - p * 0.004 * size
        dirv = (f * math.cos(fan) + s * math.sin(fan)).normalized()
        pts = [base]
        cur = base
        dd = dirv
        for j, L in enumerate(lens):
            ang = curl * (0.35 + 0.5 * j)
            dd = (dirv * math.cos(ang) - p * math.sin(ang)).normalized()
            cur = cur + dd * L * size * (1.0 + 0.12 * (1 - abs(o) / 2.0))
            pts.append(cur)
        # the claw: a longer, harder hook past the last joint
        tip = cur + (dd * 0.7 - p * 0.55).normalized() * 0.05 * size
        pts.append(tip)
        m.tube(pts, [0.0105 * size, 0.0092 * size, 0.0078 * size, 0.006 * size, 0.0012 * size], mat, seg=6, smooth=70, cap=True)
        m.cyl(pts[-2], tip, 0.0075 * size, 0.0, claw, seg=6)
    # thumb
    base = wrist + f * 0.035 * size + s * 0.03 * size
    td = (f * 0.55 + s * 0.8 - p * 0.15).normalized()
    t1 = base + td * 0.05 * size
    t2 = t1 + (td * 0.7 - p * 0.35 * curl - p * 0.2).normalized() * 0.045 * size
    m.tube([base, t1, t2], [0.011 * size, 0.0085 * size, 0.0012 * size], mat, seg=6, smooth=70, cap=True)


# ------------------------------------------------------------------------------------------------ hood

def hood_mesh(h=0.42, r_collar=0.17, r_mid=0.15, depth=1.2, open_deg=40.0, tip_back=0.1, mat='sp_hood', inner='sp_hood_in',
              trim='sp_trim', trim_r=0.008, seg=22, round=0.0):
    """A pointed hood: an open shell (the face looks out of the front, -Y) with a glowing hem along its opening. Local frame:
    origin at the base ring's centre, +Z up. The tip curls back (+Y). Returns a Mesh."""
    out = Mesh('hood')
    rings = 12
    prof = []
    for i in range(rings + 1):
        t = i / rings
        # collar -> fullest around 35 % -> peak
        r = r_collar * (1 - t) + r_mid * t
        r = r * (1.0 + 0.1 * math.sin(PI * min(t * 1.6, 1.0))) * (1.0 - t ** (2.2 + 1.8 * round))
        prof.append((h * t, max(r, 0.0)))
    w = math.radians(open_deg)
    phase = -PI / 2 + w                    # from the opening's east edge, round the back, to its west edge
    arc = 2 * PI - 2 * w
    M = scale(1.0, depth, 1.0)
    shell = Mesh('shell')
    shell.lathe(prof, mat, M, seg=seg, smooth=60.0, phase=phase, cap=False, arc=arc)
    # sink the inside faces' colour: the same shell, a hair smaller, dark (what you see through the opening)
    prof2 = [(z + 0.004, max(r - 0.006, 0.0)) for z, r in prof]
    shell.lathe(prof2, inner, M, seg=seg, smooth=60.0, phase=phase, cap=False, arc=arc)
    shell.warp(0.006, 9.0, 1.3)
    # curl the tip back and let the front edge drop a little
    for v in shell.bm.verts:
        t = max(v.co.z / h, 0.0)
        v.co.y += tip_back * t ** 2.4 + 0.02 * t
    out.add(shell)
    shell.free()
    # glowing hem along both edges of the opening
    for sgn in (-1, 1):
        pts = []
        for i in range(rings):
            t = i / rings
            z, r = prof[i]
            ang = -PI / 2 + sgn * w
            pts.append((r * math.cos(ang), r * math.sin(ang) * depth + tip_back * t ** 2.4 + 0.02 * t, z))
        out.tube(pts, [trim_r * (1.0 - 0.7 * i / rings) for i in range(len(pts))], trim, seg=5, smooth=70)
    return out


# ------------------------------------------------------------------------------------------------ soul lantern

def lantern(m, mx, flame=1.0, glow=1.0, rust=False, s=1.0):
    """A hexagonal iron lantern hanging from its top ring, with a soul flame inside. Local frame: origin at the ring, hanging down
    -Z, about 0.34 m tall at s = 1. `flame` scales the flame (0 = out), `glow` its brightness."""
    iron = 'sp_iron_rust' if rust else 'sp_iron'
    M = mx @ scale(s)
    ring = [(0.026 * math.cos(a), 0.0, 0.026 * math.sin(a) + 0.026) for a in np.linspace(0, 2 * PI, 11)]
    m.tube(ring, 0.0055, iron, seg=6, mx=M, cap=True)
    m.lathe([(-0.002, 0.03), (-0.04, 0.075), (-0.052, 0.098)], iron, M, seg=6, smooth=0, cap=True, phase=PI / 6)   # roof
    m.lathe([(-0.052, 0.098), (-0.062, 0.1)], iron, M, seg=6, smooth=0, cap=True, phase=PI / 6)                      # roof lip
    for k in range(6):
        a = PI / 6 + k * PI / 3 + PI / 6
        x, y = 0.082 * math.cos(a), 0.082 * math.sin(a)
        m.cyl((x, y, -0.064), (x, y, -0.3), 0.0085, 0.0085, iron, seg=6, mx=M)
    m.lathe([(-0.14, 0.087), (-0.15, 0.087)], iron, M, seg=6, smooth=0, cap=False, phase=PI / 6)                     # mid band
    m.lathe([(-0.3, 0.092), (-0.324, 0.074), (-0.34, 0.03)], iron, M, seg=6, smooth=0, cap=True, phase=PI / 6)       # base
    if flame > 0.02:
        f = flame
        zc = -0.2
        m.ball((0, 0, zc), (0.05 * f, 0.05 * f, 0.082 * f), 'sp_halo', mx=M, seg=12, rings=7)
        prof = [(zc + dz * f, r * f) for dz, r in ((-0.07, 0.0), (-0.062, 0.03), (-0.015, 0.044), (0.04, 0.03), (0.1, 0.0))]
        m.lathe(prof, 'sp_flame', mx=M, seg=10, smooth=70, cap=False)
        m.ball((0, 0, zc), (0.026 * f, 0.026 * f, 0.044 * f), 'soul', mx=M, seg=10, rings=6)


# ------------------------------------------------------------------------------------------------ baked strands

class RagSim:
    """Many independent strands (rags, veils, chains) pinned at moving root points, baked with cloth.py.

        rs = RagSim(gravity=1.6, drag=1.3)
        rs.add(root, length, n=9, w=0.04, up=(1, 0, 0))          # call once per strand, in a fixed order
        sims = rs.bake(roots_fn, colliders_fn, air_fn, times, period=0.8)    # roots_fn(t) -> [root xyz per strand]
        rs.draw(m, sims[i], mat='sp_rag')
    """

    def __init__(self, gravity=1.6, drag=1.3, damping=0.02, iterations=10):
        from cloth import Cloth
        self.cl = Cloth(gravity=gravity, drag=drag, damping=damping, iterations=iterations)
        self.strands = []

    def add(self, root, length, n=9, w=0.04, up=(1, 0, 0), mat='sp_rag', stiff=1.0, bend=0.35, down=(0, 0, -1), r=0.012, kind='rag',
            seg=6, flat=0.28, taper=0.9):
        root = Vector(root)
        dn = Vector(down).normalized()
        pts = [tuple(root + dn * (length * i / (n - 1))) for i in range(n)]
        idx = self.cl.chain(pts, pinned=1, stiff=stiff, bend=bend, r=r)
        self.strands.append(dict(idx=idx, w=w, up=Vector(up), mat=mat, kind=kind, seg=seg, flat=flat, taper=taper))
        return len(self.strands) - 1

    def bake(self, roots_fn, colliders_fn, air_fn, times, period=None, settle=0.8, loops=4):
        firsts = [s['idx'][0] for s in self.strands]

        def drive(t):
            roots = roots_fn(t)
            return {i: tuple(p) for i, p in zip(firsts, roots)}, colliders_fn(t), air_fn(t)

        return self.cl.bake(drive, times, loops=loops, settle=settle, period=period)

    def points(self, X, k):
        return [Vector(X[i]) for i in self.strands[k]['idx']]

    def draw(self, m, X, kinds=None, scale_w=1.0, scales=None):
        """Draw the strands as ribbons; `scales` = {kind: width factor} thins a kind out (0 = not drawn)."""
        for k, s in enumerate(self.strands):
            if kinds is not None and s['kind'] not in kinds:
                continue
            f = scale_w * (scales or {}).get(s['kind'], 1.0)
            if s['kind'] == 'chain' or f < 0.04:
                continue
            pts = [tuple(p) for p in self.points(X, k)]
            ribbon(m, pts, s['w'] * f, s['mat'], up=s['up'], flat=s['flat'], seg=s['seg'], taper=s['taper'])


def chain_links(m, pts, r=0.0085, mat='sp_iron', bead=1.5):
    """A beaded iron chain through `pts`."""
    P = [Vector(p) for p in pts]
    m.tube([tuple(p) for p in P], r * 0.55, mat, seg=5, smooth=70, cap=True)
    for p in P[1:-1]:
        m.ball(p, r * bead, mat, seg=6, rings=4)


# ------------------------------------------------------------------------------------------------ rendering

def anim(ctx, prefix, n, fn, dirs=8, mirror=True, ppm=bl.PPM, fps=12, loop=True, set=None, pivot=(0.0, 0.0), pad=3, look=None):
    """ctx.anim, but never flushing the render queue in the middle of a frame.

    render.Ctx._queue flushes (and clear_objects frees every mesh nothing uses yet) as soon as the pending area passes a limit; with
    big frames that happens between two directions of the same frame, and the next direction's Cell then reads a removed mesh
    (ReferenceError). Here the queue is flushed before a frame is built when it is already well filled, so a frame's directions
    always go in together."""
    s = set or ctx.set
    dl = bl.directions(dirs, mirror) if dirs > 1 else [(0, PI / 2)]
    names = [['%s_d%d_%d' % (prefix, d, i) if dirs > 1 else '%s_%d' % (prefix, i) for i in range(n)] for d, _ in dl]
    ctx._meta(s)['anims'][prefix] = dict(n=n, dirs=dirs, mirror=bool(mirror), fps=fps, loop=bool(loop))
    if not any(ctx.want(nm) for row in names for nm in row):
        return
    limit = 1.6 * (bl.SHEET_MAX // bl.SS) ** 2
    for i in range(n):
        if not any(ctx.want(row[i]) for row in names):
            continue
        if sum(c.w * c.h for c, _ in ctx.pending.get(ppm, [])) > 0.55 * limit:
            ctx.flush()
        mes = ctx._datablocks(fn(i), '%s_%d' % (prefix, i))
        for (d, a), row in zip(dl, names):
            if ctx.want(row[i]):
                R = bl.facing(a)
                ctx._queue(bl.Cell(row[i], [(me, R) for me in mes], pivot=pivot, pad=pad, ppm=ppm, look=look), s)


# ------------------------------------------------------------------------------------------------ rune textures

def _line(mask, x0, y0, x1, y1, t=1.0):
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 2
    H, W = mask.shape
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        y = y0 + (y1 - y0) * i / n
        for dy in range(-int(t), int(t) + 1):
            for dx in range(-int(t), int(t) + 1):
                if dx * dx + dy * dy <= t * t + 0.3:
                    xx, yy = int(round(x)) + dx, int(round(y)) + dy
                    if 0 <= xx < W and 0 <= yy < H:
                        mask[yy, xx] = 1.0


def _glyph(mask, cx, cy, size, rnd):
    """One angular rune: a stem with a few ticks and branches."""
    s = size / 2.0
    _line(mask, cx, cy - s, cx, cy + s, 0.8)
    for _ in range(rnd.randint(2, 4)):
        y = cy + rnd.uniform(-s, s)
        dy = rnd.choice((-1, 1)) * rnd.uniform(0.2, 0.9) * s
        side = rnd.choice((-1, 1))
        _line(mask, cx, y, cx + side * rnd.uniform(0.4, 0.9) * s, y + dy, 0.7)
    if rnd.random() < 0.5:
        _line(mask, cx - 0.6 * s, cy - s, cx + 0.6 * s, cy - s, 0.7)


def rune_image(w, h, bands, stole, color=(0.4, 0.95, 0.9), seed=1):
    """RGBA float image (array row 0 = top = UV v 1) with glowing runes: `bands` = [(v0, v1)] horizontal rune rings, `stole` =
    (u0, u1, v0, v1) a vertical column of runes. Alpha is the rune mask."""
    import random
    rnd = random.Random(seed)
    mask = np.zeros((h, w), np.float32)
    for v0, v1 in bands:
        y0, y1 = (1 - v1) * h, (1 - v0) * h
        gs = (y1 - y0)
        n = max(int(w / (gs * 0.9)), 3)
        for i in range(n):
            _glyph(mask, (i + 0.5) * w / n, (y0 + y1) / 2, gs * 0.8, rnd)
        _line(mask, 0, y0, w, y0, 0.6)
        _line(mask, 0, y1, w, y1, 0.6)
    if stole:
        u0, u1, v0, v1 = stole
        x0, x1 = u0 * w, u1 * w
        y0, y1 = (1 - v1) * h, (1 - v0) * h
        gs = x1 - x0
        n = max(int((y1 - y0) / (gs * 1.5)), 2)
        for i in range(n):
            _glyph(mask, (x0 + x1) / 2, y0 + (i + 0.5) * (y1 - y0) / n, gs * 1.15, rnd)
        _line(mask, x0, y0, x0, y1, 0.6)
        _line(mask, x1, y0, x1, y1, 0.6)
    img = np.zeros((h, w, 4), np.float32)
    img[..., :3] = color
    img[..., 3] = mask
    return img
