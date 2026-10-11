"""Wings for the Hollow Seraph: a bony arm (shoulder, elbow, wrist, hand) carrying rows of long, layered, tattered feathers.

Everything is computed in the CHEST frame of the body (x = the character's left, y = back, z = up) and added with mx = chest, so
wings follow the torso. A wing pose is a small dict:
  el    elevation of the upper arm above horizontal (rad)       sw    sweep of the arm toward the back (rad)
  ex    extension 0..1 (1 = fully spread, 0 = folded, Z-shaped)  tilt  0 = the wing plane is vertical (feathers hang down from the
  fan   spread of the primaries 0..1                              leading edge), pi/2 = flat (feathers trail backward)
  droop how much the feathers hang under their own weight
`feather_geometry` gives every feather's root, direction, length and width; `lag` runs a soft spring per feather tip so the
feathers trail and flutter (baked secondary motion, looping); `build_wing` makes the meshes.
"""
import math

import numpy as np
from mathutils import Vector

import mats
from bl import Mesh

PI = math.pi
L1, L2, L3 = 0.5, 0.72, 0.6          # upper arm, forearm, hand (m)


def _sm(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------------------------------------ geometry

def joints(sx, wp, shoulder):
    """Shoulder, elbow, wrist, hand-tip points and the in-plane frames (a = along the bone, c = toward the trailing edge) of the
    three bones, in the chest frame."""
    el, sw, ex, tilt = wp['el'], wp['sw'], wp['ex'], wp['tilt']
    a1 = Vector((sx * math.cos(el) * math.cos(sw), math.cos(el) * math.sin(sw), math.sin(el))).normalized()
    cd = Vector((0, 0, -1.0))
    cd = (cd - a1 * cd.dot(a1))
    cd = cd.normalized() if cd.length > 1e-6 else Vector((0, 1, 0))
    cb = Vector((0, 1.0, 0))
    cb = (cb - a1 * cb.dot(a1)).normalized()
    c1 = (cd * math.cos(tilt) + cb * math.sin(tilt)).normalized()
    th1 = (1.0 - ex) * 1.5 + wp.get('bend', 0.0)
    th2 = th1 - (1.0 - ex) * 1.4 - wp.get('wrist', 0.0)
    a2 = a1 * math.cos(th1) + c1 * math.sin(th1)
    c2 = -a1 * math.sin(th1) + c1 * math.cos(th1)
    a3 = a1 * math.cos(th2) + c1 * math.sin(th2)
    c3 = -a1 * math.sin(th2) + c1 * math.cos(th2)
    S = Vector(shoulder)
    E = S + a1 * L1
    W = E + a2 * L2
    T = W + a3 * L3
    return dict(S=S, E=E, W=W, T=T, a=(a1, a2, a3), c=(c1, c2, c3))


def _along(J, u):
    """Point and local (a, c) at parameter u (0..1) along the arm."""
    tot = L1 + L2 + L3
    s = u * tot
    if s <= L1:
        k, f0, f1, P0 = 0, 0.0, L1, J['S']
    elif s <= L1 + L2:
        k, f0, f1, P0 = 1, L1, L1 + L2, J['E']
    else:
        k, f0, f1, P0 = 2, L1 + L2, tot, J['W']
    a, c = J['a'][k], J['c'][k]
    return P0 + a * (s - f0), a, c


# (kind, u0, u1, count, length0, length1, width, fan0, fan1, layer)
LAYOUT = [
    ('sec', 0.10, 0.62, 8, 0.95, 0.85, 0.19, 0.0, 0.4, 0),
    ('pri', 0.66, 1.0, 8, 1.05, 1.4, 0.17, 0.45, 1.25, 0),
    ('cov1', 0.08, 0.98, 12, 0.52, 0.6, 0.18, 0.0, 0.9, 1),
    ('cov2', 0.12, 0.92, 9, 0.3, 0.34, 0.17, 0.0, 0.7, 2),
]


def feather_geometry(sx, wp, shoulder, seed=0):
    """List of feathers (dicts) of one wing in the chest frame."""
    J = joints(sx, wp, shoulder)
    ex, fan = wp['ex'], wp.get('fan', 1.0)
    fold = wp['fold'] if 'fold' in wp else min(1.0, max(0.0, (1.0 - ex) * 2.0))
    out = []
    k = 0
    for kind, u0, u1, cnt, l0, l1, wid, f0, f1, layer in LAYOUT:
        for i in range(cnt):
            q = i / max(cnt - 1, 1)
            jit = math.sin((i + 1) * 12.9898 + seed * 78.233 + layer * 3.1) * 0.5
            jit2 = math.sin((i + 3) * 7.13 + seed * 5.7 + layer) * 0.5
            u = u0 + (u1 - u0) * q
            R, a, c = _along(J, u)
            phi = f0 + (f1 - f0) * q
            psi = -1.25 * fold + phi * fan + 0.05 * jit
            d = (c * math.cos(psi) + a * math.sin(psi)).normalized()
            nrm = a.cross(c).normalized()
            ln = (l0 + (l1 - l0) * q) * (1.0 + 0.1 * jit2) * (0.4 + 0.6 * ex if kind in ('pri', 'sec') else 0.6 + 0.4 * ex)
            if kind == 'pri':
                ln *= 1.0 - 0.25 * abs(q - 0.35)
            out.append(dict(kind=kind, i=k, layer=layer, root=R + nrm * (-0.012 * layer), d=d, n=nrm, len=ln, wid=wid * (1.0 + 0.1 * jit),
                            q=q, tip0=R + d * ln))
            k += 1
    return J, out


# ------------------------------------------------------------------------------------------------ the lag spring

def lag(pose_wings, times, period, loops=3, settle=0.5):
    """Soft spring on every feather tip: returns, for each time, {(side, feather index): offset Vector} (chest frame).
    pose_wings(t) -> {'l': (shoulder, wp), 'r': (shoulder, wp)} gives the wing poses at time t."""
    dt = 1.0 / 240.0
    state = {}

    def tips(t):
        res = {}
        for s, sx in (('l', 1.0), ('r', -1.0)):
            sh, wp = pose_wings(t)[s]
            J, F = feather_geometry(sx, wp, sh, seed=(1 if s == 'l' else 2))
            for f in F:
                res[(s, f['i'])] = (f['tip0'], f['len'], f['kind'])
        return res

    def step(t):
        tp = tips(t)
        for key, (T0, ln, kind) in tp.items():
            if key not in state:
                state[key] = [T0.copy(), Vector((0, 0, 0))]
            T, V = state[key]
            q = 0.0
            fn = (3.0 if kind in ('pri', 'cov1') else 3.8 if kind == 'sec' else 5.0) * (1.0 - 0.25 * q)
            k = (2 * PI * fn) ** 2
            zeta = 0.3
            acc = (T0 - T) * k - V * (2 * zeta * math.sqrt(k))
            V += acc * dt
            T += V * dt
            off = T - T0
            lim = 0.38 * ln
            if off.length > lim:
                T = T0 + off.normalized() * lim
                state[key][0] = T
        return tp

    t0 = times[0]
    out = []
    if period:
        tt = 0.0
        total = period * loops
        sample = [t0 + period * (loops - 1) + (t - t0) for t in times]
        k = 0
        while k < len(sample):
            tp = step(t0 + (tt % period))
            tt += dt
            while k < len(sample) and t0 + tt >= sample[k] - 1e-9:
                out.append({key: (state[key][0] - tp[key][0]) for key in tp})
                k += 1
            if tt > total + period:
                break
    else:
        tt = 0.0
        while tt < settle:
            step(t0)
            tt += dt
        t = t0
        k = 0
        while k < len(times):
            tp = step(t)
            while k < len(times) and t >= times[k] - 1e-9:
                out.append({key: (state[key][0] - tp[key][0]) for key in tp})
                k += 1
            t += dt
    return out


# ------------------------------------------------------------------------------------------------ materials and meshes

def feather_image(variant, w=48, h=128):
    """RGBA float image (sRGB, row 0 = the tip): barbs slanting toward the tip, a pale rachis, teal tint at the tips."""
    img = np.ones((h, w, 4), np.float32)
    ys = np.linspace(1.0, 0.0, h)[:, None]       # row 0 is the tip: v = 1
    xs = np.linspace(-1.0, 1.0, w)[None, :]
    ax = np.abs(xs)
    base0 = np.array([0.05, 0.035, 0.11])
    base1 = np.array([0.15, 0.105, 0.27])
    teal = np.array([0.16, 0.62, 0.66])
    if variant == 1:
        base0 = np.array([0.04, 0.05, 0.12])
        base1 = np.array([0.11, 0.15, 0.3])
    if variant == 2:
        base0 = np.array([0.07, 0.035, 0.1])
        base1 = np.array([0.2, 0.1, 0.25])
    t = ys * np.ones_like(xs)
    col = base0[None, None, :] * (1 - t[..., None]) + base1[None, None, :] * (t[..., None] * 0.6 + 0.2)
    ph = t * 58.0 - ax * 13.0
    barbs = (np.sin(ph * 2 * PI) > 0.25).astype(np.float32)
    col = col * (1.0 + 0.35 * barbs[..., None])
    col = col * (1.0 - 0.35 * np.clip((ax - 0.7) / 0.3, 0, 1)[..., None])
    rach = (ax < 0.06).astype(np.float32)
    col = col * (1 - rach[..., None]) + np.array([0.52, 0.5, 0.66]) * rach[..., None]
    tipm = np.clip((t - 0.78) / 0.22, 0, 1) ** 1.3
    if variant != 1:
        tipm = tipm * 0.6
    col = col * (1 - tipm[..., None]) + teal[None, None, :] * 1.3 * (tipm[..., None] * (0.55 + 0.45 * barbs[..., None]))
    col = col * 0.58
    img[..., :3] = np.clip(col, 0, 1) ** (1 / 2.2)     # the kit expects sRGB colour
    return img


def register_image(key, rgba):
    """mats.image, but safe in Blender 5.2: there, changing the colour space of a GENERATED image after its pixels were set
    regenerates it (opaque black), so colour space and alpha mode are set FIRST and the pixels last."""
    import bpy
    rgba = np.asarray(rgba, np.float32)
    h, w = rgba.shape[:2]
    img = bpy.data.images.get('tex_' + key) or bpy.data.images.new('tex_' + key, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    img.update()
    mats._images[key] = img
    return img


def define_feather_materials():
    for v in range(3):
        register_image('sr_feather_img%d' % v, feather_image(v))
        mats.define('sr_feather%d' % v, base='#2a2146', tex='sr_feather_img%d' % v, tex_gloss=0.25, tex_bump=0.5, gloss=0.2, bevel=0.006,
                    seed=70 + v)


def feather_mesh(m, f, off, mx, droop=0.0, mat=None):
    """One feather as a ridged, serrated, two-sided sheet that curves toward its lagging tip."""
    R, d, n, ln, wid = f['root'], f['d'], f['n'], f['len'], f['wid']
    nv = 7
    o = off if off is not None else Vector((0, 0, 0))
    grav = Vector((0, 0, -1.0)) * (droop * 0.1 * ln)
    C, A, HW = [], [], []
    pts = []
    for j in range(nv + 1):
        t = j / nv
        pts.append(R + d * (ln * t) + (o + grav) * (t * t))
    for j in range(nv + 1):
        t = j / nv
        tg = (pts[min(j + 1, nv)] - pts[max(j - 1, 0)])
        tg = tg.normalized() if tg.length > 1e-9 else d
        a = n.cross(tg)
        a = a.normalized() if a.length > 1e-9 else Vector((1, 0, 0))
        hw = 0.5 * wid * (t ** 0.4) * max(0.0, 1.0 - t ** 2.0) ** 0.75
        ser = 0.42 if t > 0.4 else 0.0
        hl = hw * (1.0 - ser * (j % 2))
        hr = hw * (1.0 - ser * ((j + 1) % 2))
        C.append(pts[j])
        A.append(a)
        HW.append((hl, hr, 0.012 * math.sin(PI * min(t * 1.2, 1.0)) * (1.0 - t)))
    nn = n

    def fn(u, v):
        j = min(int(round(v * nv)), nv)
        hl, hr, ridge = HW[j]
        if u < 0.25:
            return C[j] - A[j] * hl
        if u > 0.75:
            return C[j] + A[j] * hr
        return C[j] + nn * ridge

    m.grid_sheet(fn, 2, nv, mat or ('sr_feather%d' % (f['layer'] % 3)), mx=mx, smooth=70, thick=0.006)


def build_wing(m, sx, wp, shoulder, offsets, mx, seed, bone_mat='sr_horn', claw_mat='bs_bone_hi'):
    """The wing's arm bones and every feather. offsets = {(side, index): Vector} from `lag` (or None)."""
    side = 'l' if sx > 0 else 'r'
    J, F = feather_geometry(sx, wp, shoulder, seed=(1 if side == 'l' else 2))
    S, E, W, T = J['S'], J['E'], J['W'], J['T']
    droop = wp.get('droop', 0.5)
    cr = wp.get('crumble', 0.0)
    # farthest layers first so the layered rows read; each layer is nudged along the wing normal
    for f in sorted(F, key=lambda f: -f['layer']):
        off = offsets.get((side, f['i'])) if offsets else None
        g = dict(f)
        if cr > 0.0:        # the feathers come away one by one and the rest wither
            h = abs(math.sin((f['i'] + 1) * 78.233 + seed * 12.9898) * 43758.5453) % 1.0
            if h < cr * 0.9:
                continue
            g['len'] = f['len'] * max(0.3, 1.0 - 0.45 * cr)
        nrm = f['n']
        g['root'] = f['root'] + nrm * (0.014 * (2 - f['layer']) * (1 if sx > 0 else 1))
        feather_mesh(m, g, off, mx, droop=droop)
    # the bones: a thick leading edge, knobbed joints, a hooked claw at the wrist
    m.capsule(S, E, 0.06, 0.05, bone_mat, mx=mx, seg=8, rings=3)
    m.capsule(E, W, 0.05, 0.04, bone_mat, mx=mx, seg=8, rings=3)
    m.capsule(W, T, 0.04, 0.02, bone_mat, mx=mx, seg=7, rings=3)
    for p, r in ((E, 0.075), (W, 0.06)):
        m.ball(p, r, 'bs_bone_old', mx=mx, seg=9, rings=5)
    a2 = J['a'][1]
    c2 = J['c'][1]
    from bosses_lib import blade
    blade(m, W, W + a2 * 0.22 - c2 * 0.12, 0.05, claw_mat, bend=(0, 0, 0), up=(1, 0, 0), flat=0.6, mx=mx, n=3)
    return J
