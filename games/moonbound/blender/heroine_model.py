"""Maelis's meshes for one frame: body, hat, hair, garments and the two weapons, from a solved pose (heroine_rig.solve) and the
baked cloth (heroine_sim). Everything is built facing south (-Y) on z = 0."""
import math

import numpy as np
from mathutils import Matrix, Vector

import heroine_geo as G
import heroine_sim as HS
from bl import Mesh, trans, rotx, roty, rotz
from heroine_rig import D, HEAD_C, HAT_Z, HAT_TILT, weapon_frame, hand_frame

PI = math.pi


def V(p):
    return Vector((float(p[0]), float(p[1]), float(p[2])))


# ------------------------------------------------------------------------------------------------ body

FOOT_HULL = [(sx * x, y, z) for sx in (-1, 1) for (x, y, z) in (
    (0.031, 0.058, -0.067), (0.033, 0.06, -0.03), (0.03, 0.05, 0.0), (0.037, -0.02, -0.067), (0.038, -0.06, -0.067),
    (0.036, -0.12, -0.067), (0.026, -0.185, -0.062), (0.033, -0.03, 0.0), (0.032, -0.09, -0.035), (0.026, -0.16, -0.045),
    (0.012, -0.19, -0.052))] + [(0.0, -0.205, -0.064), (0.0, 0.066, -0.05)]
SOLE_HULL = [(sx * x, y, z) for sx in (-1, 1) for (x, y, z) in (
    (0.032, 0.059, -0.075), (0.032, 0.059, -0.066), (0.038, -0.02, -0.075), (0.039, -0.02, -0.066), (0.039, -0.06, -0.075),
    (0.039, -0.12, -0.075), (0.028, -0.188, -0.069), (0.039, -0.12, -0.066), (0.028, -0.188, -0.061))] + \
    [(0.0, -0.208, -0.067), (0.0, -0.208, -0.06), (0.0, 0.068, -0.07)]


def boot(m, S, s):
    sx = 1.0 if s == 'l' else -1.0
    knee, ankle, F = getattr(S, 'knee_' + s), getattr(S, 'ankle_' + s), getattr(S, 'foot_' + s)
    up = (knee - ankle).normalized()
    top = ankle + up * 0.35
    m.cyl(ankle - up * 0.02, top, 0.04, 0.052, 'hr_boot', seg=14, smooth=70)
    m.cyl(top - up * 0.026, top + up * 0.012, 0.0555, 0.0575, 'hr_boot', seg=14, smooth=70, bevel=0.003)
    m.hull([Vector(p) for p in FOOT_HULL], 'hr_boot', mx=F, smooth=50.0, bevel=0.006)
    m.hull([Vector(p) for p in SOLE_HULL], 'hr_sole', mx=F, smooth=30.0)
    # gold buckles on the outer side of the cuff and the ankle strap
    side = (S.pelvis.to_3x3() @ Vector((sx, 0, 0)))
    for t, hgt in ((0.31, 0.022), (0.075, 0.016)):
        c = ankle + up * t + side * (0.054 if t > 0.2 else 0.043)
        ax = up
        m.box(-0.0085, 0.0085, -0.004, 0.004, -hgt / 2, hgt / 2, 'hr_gold', mx=_frame(c, side, ax), bevel=0.0015)


def _frame(origin, x_dir, z_dir):
    """A 4x4 with +X ~ x_dir, +Z = z_dir (Gram-Schmidt) at origin."""
    z = Vector(z_dir).normalized()
    x = Vector(x_dir) - z * Vector(x_dir).dot(z)
    x = x.normalized() if x.length > 1e-6 else z.orthogonal().normalized()
    y = z.cross(x)
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = Vector(origin)
    return M


def torso(m, S):
    P, SP, CH = S.pelvis, S.spine, S.chest
    n = 22
    rings = [G.ring_pts(P, -0.04, 0.142, 0.100, 0.095, n),
             G.ring_pts(P, 0.06, 0.135, 0.097, 0.093, n),
             G.ring_pts(SP, 0.17, 0.104, 0.082, 0.078, n),
             G.ring_pts(CH, 0.03, 0.114, 0.090, 0.086, n),
             G.ring_pts(CH, 0.10, 0.127, 0.108, 0.088, n),
             G.ring_pts(CH, 0.165, 0.140, 0.095, 0.086, n),
             G.ring_pts(CH, 0.205, 0.094, 0.072, 0.068, n),
             G.ring_pts(CH, 0.232, 0.058, 0.054, 0.052, n)]
    G.loft(m, rings, 'hr_coat', smooth=60)
    # gold trim down the front and the neckline
    fr = []
    for ring, M in zip(rings[2:7], (SP, CH, CH, CH, CH)):
        p = ring[0]
        fr.append(p + (M.to_3x3() @ Vector((0, -0.003, 0))))
    m.tube(fr, 0.0042, 'hr_gold', seg=5, flat=1.0, cap=True)
    for sx in (-1, 1):
        m.ball(getattr(S, 'sh_l' if sx > 0 else 'sh_r'), 0.054, 'hr_coat', seg=14, rings=9)
    # a high collar, flared at the top, trimmed in gold; the neck inside it
    m.lathe([(-0.03, 0.058), (0.0, 0.054), (0.03, 0.057), (0.066, 0.07)], 'hr_coat', mx=S.neck, seg=22, cap=False, smooth=60)
    m.lathe([(0.062, 0.0705), (0.0685, 0.0705)], 'hr_gold', mx=S.neck, seg=22, cap=False, smooth=40, bevel=0.0)
    m.lathe([(-0.024, 0.0595), (-0.019, 0.0595)], 'hr_gold', mx=S.neck, seg=22, cap=False, smooth=40)
    m.capsule(S.neck.translation.copy(), S.head.translation + (S.head.to_3x3() @ Vector((0, 0, 0.02))), 0.033, 0.031, 'hr_skin', seg=12, rings=3)
    # belt, buckle, pouches
    pts = G.circle_pts(SP, 0.118, 28, rz=0.092, z=0.165)
    m.tube(pts, 0.0175, 'hr_belt', seg=6, flat=0.3, up=(0, 0, 1), cap=False, smooth=60)
    bm = SP @ trans(0, -0.1, 0.165)
    G.crescent_prism(m, 0.03, 0.0245, 0.013, 0.009, 'hr_gold', mx=bm, bevel=0.0015)
    m.ball((0, -0.006, 0.0), 0.0075, 'hr_gem', mx=bm, seg=8, rings=6)
    for th in (-64.0, 64.0):
        a = math.radians(th)
        M = SP @ trans(0.158 * math.sin(a), -0.122 * math.cos(a), 0.0) @ rotz(a)
        m.box(-0.028, 0.028, -0.034, 0.0, 0.082, 0.158, 'hr_belt', mx=M, bevel=0.006)
        m.box(-0.03, 0.03, -0.037, 0.002, 0.125, 0.16, 'hr_belt', mx=M, bevel=0.006)
        m.box(-0.006, 0.006, -0.04, -0.034, 0.12, 0.138, 'hr_gold', mx=M, bevel=0.002)


def head(m, S):
    H = S.head
    m.ball((0, 0.008, HEAD_C + 0.002), (0.077, 0.094, 0.109), 'hr_skin', mx=H, seg=20, rings=12)
    m.ball((0, -0.036, 0.04), (0.049, 0.056, 0.047), 'hr_skin', mx=H, seg=14, rings=8)
    m.ball((0, -0.07, 0.022), (0.021, 0.02, 0.021), 'hr_skin', mx=H, seg=10, rings=6)      # the chin, small and pointed
    for sx in (-1, 1):
        m.ball((sx * 0.047, -0.052, 0.07), (0.03, 0.03, 0.03), 'hr_skin', mx=H, seg=10, rings=6)
        m.ball((sx * 0.032, -0.078, HEAD_C + 0.006), (0.0135, 0.009, 0.0105), 'hr_eye', mx=H, seg=10, rings=6)
        m.ball((sx * 0.032, -0.0845, HEAD_C + 0.006), (0.0082, 0.0035, 0.0088), 'hr_iris', mx=H, seg=8, rings=5)
        m.tube([Vector((sx * 0.018, -0.086, HEAD_C + 0.026)), Vector((sx * 0.034, -0.088, HEAD_C + 0.03)),
                Vector((sx * 0.052, -0.074, HEAD_C + 0.024))], 0.0028, 'hr_brow', seg=5, mx=H, cap=True)
        m.ball((sx * 0.078, 0.008, HEAD_C - 0.01), (0.008, 0.018, 0.026), 'hr_skin', mx=H, seg=8, rings=5)
        # upper lid with its lash line, and a shadowed eye socket
        m.tube([Vector((sx * 0.017, -0.0835, HEAD_C + 0.0155)), Vector((sx * 0.031, -0.0865, HEAD_C + 0.0185)),
                Vector((sx * 0.046, -0.0805, HEAD_C + 0.0125))], 0.0026, 'hr_lash', seg=5, mx=H, cap=True)
    m.ball((0, -0.088, 0.077), (0.0075, 0.012, 0.013), 'hr_skin', mx=H, seg=10, rings=6)
    m.capsule((0, -0.082, HEAD_C + 0.003), (0, -0.088, 0.077), 0.005, 0.0075, 'hr_skin', mx=H, seg=8, rings=3)
    m.ball((0, -0.08, 0.044), (0.021, 0.01, 0.0065), 'hr_lip', mx=H, seg=10, rings=6)
    m.ball((0, -0.079, 0.034), (0.017, 0.009, 0.006), 'hr_lip', mx=H, seg=10, rings=6)
    # the hair cap over the skull
    m.ball((0, 0.02, HEAD_C + 0.022), (0.093, 0.103, 0.096), 'hr_hair_cap', mx=H, seg=18, rings=10)


def arm(m, S, s):
    sh, el, wr, fi = getattr(S, 'sh_' + s), getattr(S, 'elbow_' + s), getattr(S, 'wrist_' + s), getattr(S, 'fist_' + s)
    m.capsule(sh, el, 0.042, 0.035, 'hr_coat', seg=12, rings=3)
    m.capsule(el, wr, 0.033, 0.027, 'hr_glove', seg=12, rings=3)
    WF = hand_frame(S, s)
    R4 = WF.to_3x3().to_4x4()
    m.ball(fi, (0.033, 0.035, 0.05), 'hr_glove', seg=12, rings=8, rot=R4)
    # fingertips and thumb in skin, over the grip
    for k in range(3):
        m.ball(WF @ Vector((0.0, 0.034, -0.026 + 0.026 * k)), (0.012, 0.01, 0.012), 'hr_skin', seg=6, rings=4)


def legs(m, S):
    for s in ('l', 'r'):
        hip, knee, ankle = getattr(S, 'hip_' + s), getattr(S, 'knee_' + s), getattr(S, 'ankle_' + s)
        m.capsule(hip, knee, 0.07, 0.05, 'hr_legging', seg=12, rings=3)
        m.capsule(knee, ankle, 0.049, 0.036, 'hr_legging', seg=12, rings=3)
        boot(m, S, s)


def body_mesh(S):
    m = Mesh('body')
    legs(m, S)
    torso(m, S)
    head(m, S)
    arm(m, S, 'l')
    arm(m, S, 'r')
    return m


# ------------------------------------------------------------------------------------------------ hat

def hat_mesh(S, tip=(0, 0, 0), droop=None):
    m = Mesh('hat')
    H = HS.hat_frame(S)
    fn = G.hat_surface(tip=tuple(tip), droop=list(droop) if droop is not None else None, wave=0.011, lift_front=0.03)
    nc = 30
    srows = list(np.linspace(0, 0.5, 10)) + list(np.linspace(0.5, 1.0, 17)[1:])
    X = np.array([[fn(j / nc, s) for j in range(nc)] for s in srows])
    G.sheet(m, X, nc, len(srows) - 1, 'hr_felt', periodic=True, off=0.002, mx=H, smooth=70)
    G.sheet(m, X, nc, len(srows) - 1, 'hr_felt_dk', periodic=True, off=-0.002, mx=H, smooth=70)
    # the gold band round the crown's base, and the crest pinned on the front
    br = list(np.linspace(0.512, 0.565, 4))
    XB = np.array([[fn(j / nc, s) for j in range(nc)] for s in br])
    G.sheet(m, XB, nc, len(br) - 1, 'hr_gold', periodic=True, off=0.0065, mx=H, smooth=70)
    p1, p2 = fn(0.0, 0.54), fn(0.0, 0.62)
    t = (p2 - p1).normalized()
    nrm = Vector((0.0, -t.z, t.y)).normalized()
    c = fn(0.0, 0.552) + nrm * 0.011
    X3 = Vector((1, 0, 0))
    Y3 = -nrm
    Z3 = t
    M = Matrix((X3, Y3, Z3)).transposed().to_4x4()
    M.translation = c
    G.crescent_prism(m, 0.038, 0.031, 0.016, 0.0095, 'hr_silver', mx=H @ M, bevel=0.0015)
    m.ball((0.0, -0.005, 0.005), 0.0075, 'hr_gem', mx=H @ M, seg=8, rings=6)
    return m, H, fn


# ------------------------------------------------------------------------------------------------ hair

def cr_chain(P, sub=2):
    """Catmull-Rom subdivision of a polyline (N, 3) -> ((N - 1) * sub + 1, 3)."""
    N = len(P)
    out = []
    for i in range(N - 1):
        for k in range(sub):
            t = k / sub
            w = G._cr_w(t)
            p = sum(w[a] * P[min(max(i + a - 1, 0), N - 1)] for a in range(4))
            out.append(p)
    out.append(P[-1])
    return np.array(out)


def hair_mesh(X, chains, locks):
    m = Mesh('hair')
    mk = ('hr_hair_a', 'hr_hair_b', 'hr_hair_c')
    for idx, L in zip(chains, locks):
        P = np.array([X[i] for i in idx])
        pts = cr_chain(P, 2)
        n = len(pts)
        w = L['width'] * 0.5
        r = []
        for k in range(n):
            q = k / (n - 1)
            tp = min(max((q - 0.42) / 0.58, 0.0), 1.0)
            r.append(w * (1.0 - 0.93 * tp * tp * (3 - 2 * tp)) * (1.0 - 0.25 * q) + 0.002)
        m.tube([V(p) for p in pts], r, mk[L['mat']], seg=6, flat=L.get('flat', 0.34), up=Vector((1, 0, 0)), cap=True, smooth=70)
    return m


# ------------------------------------------------------------------------------------------------ garments

PANEL_MAT = {'front': 'hr_panel_front', 'back': 'hr_panel_back', 'panel': 'hr_panel'}


def garment_mesh(S, X, lay, wp):
    m = Mesh('cloth')
    axis = np.array(tuple(S.pelvis @ Vector((0, 0, 0.1))))
    for k, (G_, (cen, hs, flare, teeth, depth, kind)) in enumerate(zip(lay['skirts'], HS.PANELS)):
        A = np.array([[X[i] for i in row] for row in G_])
        hem = G.rag_hem(teeth, depth, phase=0.13 * k, seed=k + 3)
        G.sheet(m, A, 12, 14, PANEL_MAT[kind], hem=hem, off=0.002, away=axis)
        G.sheet(m, A, 12, 14, 'hr_lining', hem=hem, off=-0.0045, away=axis)
    A = np.array([[X[i] for i in row] for row in lay['under']])
    G.sheet(m, A, 24, 8, 'hr_teal', periodic=True, hem=G.rag_hem(6, 0.07, phase=0.3, seed=31), off=0.0, away='rows')
    for s in ('l', 'r'):
        A = np.array([[X[i] for i in row] for row in lay['sleeves'][s]])
        hem = G.rag_hem(5, 0.12, phase=0.2, seed=21 if s == 'l' else 22)
        G.sheet(m, A, 20, 10, 'hr_sleeve', periodic=True, hem=hem, off=0.002, away='rows')
        G.sheet(m, A, 20, 10, 'hr_lining', periodic=True, hem=hem, off=-0.0045, away='rows')
    # charms
    for ch in lay['charms']:
        P = [V(X[i]) for i in ch]
        m.tube(P, 0.0022, 'hr_chain', seg=4, cap=True)
        m.ball(P[-1] + Vector((0, 0, -0.008)), (0.006, 0.0035, 0.009), 'hr_gold', seg=6, rings=4)
    P = [V(X[i]) for i in lay['belt']]
    m.tube(P, 0.0022, 'hr_chain', seg=4, cap=True)
    G.crescent_prism(m, 0.014, 0.0115, 0.006, 0.004, 'hr_gold', mx=trans(*P[-1] + Vector((0, 0, -0.006))), bevel=0.001, n=14)
    return m


# ------------------------------------------------------------------------------------------------ weapons

def sickle(m, WF):
    """The Waning Twin in weapon-local coordinates (origin the fist, +Z toward the blade, +Y the way it curls)."""
    m.cyl((0, 0, -0.1), (0, 0, 0.1), 0.0155, 0.0155, 'hr_grip', seg=10, smooth=60, mx=WF)
    # pommel ring and guard ring
    pts = [Vector((0.0, 0.02 * math.cos(2 * PI * i / 14), -0.12 + 0.02 * math.sin(2 * PI * i / 14))) for i in range(15)]
    m.tube(pts, 0.0034, 'hr_gold', seg=5, mx=WF, cap=False)
    pts = [Vector((0.026 * math.cos(2 * PI * i / 18), 0.026 * math.sin(2 * PI * i / 18), 0.108)) for i in range(19)]
    m.tube(pts, 0.0048, 'hr_gold', seg=6, mx=WF, cap=False)
    m.cyl((0, 0, 0.1), (0, 0, 0.13), 0.019, 0.011, 'hr_gold', seg=10, mx=WF, bevel=0.002)
    m.ball((0, 0.0, 0.118), (0.0085, 0.0085, 0.0085), 'hr_gem', mx=WF, seg=8, rings=6)
    G.blade(m, (0, 0, 0.13), 0.45, 2.15, 0.06, 0.0085, 'hr_blade', mx=WF)


def staff(m, WF):
    """The Tidecaller in weapon-local coordinates (origin the right fist, +Z up the shaft, +Y the way its head faces)."""
    m.cyl((0, 0, -0.85), (0, 0, 0.86), 0.0155, 0.0175, 'hr_staffwood', seg=10, smooth=60, mx=WF)
    for z0, z1, r in ((-0.85, -0.79, 0.0205), (0.105, 0.125, 0.0195), (0.135, 0.15, 0.0195), (0.5, 0.52, 0.0195), (0.8, 0.865, 0.023)):
        m.cyl((0, 0, z0), (0, 0, z1), r, r, 'hr_gold', seg=10, mx=WF, bevel=0.002)
    m.cyl((0, 0, -0.9), (0, 0, -0.85), 0.003, 0.016, 'hr_gold_dk', seg=8, mx=WF)
    m.cyl((0, 0, 0.865), (0, 0, 0.895), 0.022, 0.012, 'hr_gold', seg=10, mx=WF, bevel=0.002)
    # the crescent head, horns up, cradling the orb
    O = Vector(HS.STAFF_O)
    R = 0.07
    sec = [(0.5, 0.0), (0.25, 0.85), (-0.25, 0.85), (-0.5, 0.0), (-0.25, -0.85), (0.25, -0.85)]
    rings = []
    N = 22
    for k in range(N + 1):
        phi = math.radians(-122 + 244 * k / N)
        c = O + Vector((R * math.sin(phi), 0.0, -R * math.cos(phi)))
        out = Vector((math.sin(phi), 0.0, -math.cos(phi)))
        w = 0.021 * (1 - 0.72 * (abs(phi) / math.radians(122)) ** 2.0) + 0.0035
        th = 0.0065
        rings.append([c + out * (o * w) + Vector((0, 1, 0)) * (h * th) for o, h in sec])
    G.loft(m, rings, 'hr_gold', smooth=50, closed=True, caps=(True, True), mx=WF)
    m.ball(O, 0.0445, 'moonfire', mx=WF, seg=16, rings=10)
    for sx in (-1, 1):
        m.ball(O + Vector((sx * 0.042, 0.0, -0.05)), 0.007, 'hr_gold', mx=WF, seg=6, rings=4)


def weapons_mesh(S, X, lay, wp):
    m = Mesh('weapons')
    if wp == 'staff':
        WF = weapon_frame(S, 'r')
        staff(m, WF)
        for ch in lay['wchains']:
            P = [V(X[i]) for i in ch]
            m.tube(P, 0.0024, 'hr_chain', seg=4, cap=True)
            m.ball(P[-1] + Vector((0, 0, -0.012)), (0.008, 0.005, 0.014), 'hr_gem', seg=6, rings=4)
    else:
        for s in ('l', 'r'):
            WF = weapon_frame(S, s)
            sickle(m, WF)
        for ch in lay['wchains']:
            P = [V(X[i]) for i in ch]
            m.tube(P, 0.0028, 'hr_cord', seg=4, cap=True)
            m.ball(P[-1] + Vector((0, 0, -0.012)), (0.006, 0.006, 0.013), 'hr_cord', seg=6, rings=4)
    return m
