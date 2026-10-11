"""Hollow lane: procedural textures (numpy only, no bpy), registered as images by hollow_mat.

Every generator returns a dict:  rgb (H,W,3 sRGB 0..1), h (H,W height 0..1), gloss (H,W 0..1 or a number),
emit (H,W 0..1 or None).  Textures tile (all noise is periodic) unless noted.  `get(name)` caches the arrays for the whole run.
Coordinates: V runs down the image (rows), U across (columns); both 0..1 over the tile.
"""
import math

import numpy as np

PI = math.pi
_cache = {}


# ------------------------------------------------------------------------------------------------ noise toolbox

def grid(n):
    V, U = np.mgrid[0:n, 0:n].astype(np.float32) / n
    return V, U


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(c0, c1, t):
    t = np.asarray(t, np.float32)[..., None]
    return c0 + (c1 - c0) * t


def _sm(t):
    return t * t * (3 - 2 * t)


def vnoise(X, Y, cx, cy, seed):
    """Periodic value noise (period cx, cy cells); X, Y are coordinates in cell units."""
    rng = np.random.default_rng(seed)
    g = rng.random((cy, cx)).astype(np.float32)
    x0 = np.floor(X).astype(np.int64)
    y0 = np.floor(Y).astype(np.int64)
    fx = _sm(X - x0)
    fy = _sm(Y - y0)
    x0 %= cx
    y0 %= cy
    x1 = (x0 + 1) % cx
    y1 = (y0 + 1) % cy
    a, b, c, d = g[y0, x0], g[y0, x1], g[y1, x0], g[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(U, V, cx, cy, octaves=4, seed=0, gain=0.5):
    """Fractal value noise over the tile (0..1)."""
    tot = np.zeros(U.shape, np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        k = 2 ** o
        tot += amp * vnoise(U * cx * k, V * cy * k, cx * k, cy * k, seed * 31 + o * 7 + 1)
        norm += amp
        amp *= gain
    return tot / norm


def voronoi(U, V, n, seed, jitter=0.9):
    """Periodic Voronoi on an n x n lattice: (F1, F2, cell id) with distances in cell units."""
    rng = np.random.default_rng(seed)
    gx, gy = np.meshgrid(np.arange(n), np.arange(n))
    px = gx + 0.5 + (rng.random((n, n)) - 0.5) * jitter
    py = gy + 0.5 + (rng.random((n, n)) - 0.5) * jitter
    X, Y = U * n, V * n
    cx, cy = np.floor(X).astype(np.int64), np.floor(Y).astype(np.int64)
    f1 = np.full(X.shape, 9.0, np.float32)
    f2 = f1.copy()
    cid = np.zeros(X.shape, np.int64)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ax, ay = cx + dx, cy + dy
            qx = px[ay % n, ax % n] + (ax - ax % n)
            qy = py[ay % n, ax % n] + (ay - ay % n)
            d = np.hypot(X - qx, Y - qy).astype(np.float32)
            ids = (ay % n) * n + (ax % n)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            cid = np.where(closer, ids, cid)
            f1 = np.where(closer, d, f1)
    return f1, f2, cid


def draw_line(cv, p0, p1, width, value=1.0, soft=1.2):
    """Anti-aliased thick segment into a float canvas (pixel coordinates, (x, y))."""
    n = cv.shape[0]
    x0, y0 = p0
    x1, y1 = p1
    pad = width + soft + 2
    xa, xb = int(max(0, min(x0, x1) - pad)), int(min(n, max(x0, x1) + pad + 1))
    ya, yb = int(max(0, min(y0, y1) - pad)), int(min(n, max(y0, y1) + pad + 1))
    if xa >= xb or ya >= yb:
        return
    Y, X = np.mgrid[ya:yb, xa:xb].astype(np.float32)
    dx, dy = x1 - x0, y1 - y0
    L2 = max(dx * dx + dy * dy, 1e-6)
    t = np.clip(((X - x0) * dx + (Y - y0) * dy) / L2, 0, 1)
    d = np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))
    v = np.clip((width - d) / soft + 0.5, 0, 1) * value
    cv[ya:yb, xa:xb] = np.maximum(cv[ya:yb, xa:xb], v)


def draw_ring(cv, cx, cy, r, width, value=1.0, soft=1.2, a0=0.0, a1=2 * PI):
    n = cv.shape[0]
    Y, X = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.abs(np.hypot(X - cx, Y - cy) - r)
    v = np.clip((width - d) / soft + 0.5, 0, 1) * value
    if a1 - a0 < 2 * PI - 1e-3:
        ang = np.mod(np.arctan2(Y - cy, X - cx) - a0, 2 * PI)
        v = v * (ang <= (a1 - a0))
    np.maximum(cv, v, out=cv)


def draw_disc(cv, cx, cy, r, value=1.0, soft=1.2):
    n = cv.shape[0]
    xa, xb = int(max(0, cx - r - 3)), int(min(n, cx + r + 4))
    ya, yb = int(max(0, cy - r - 3)), int(min(n, cy + r + 4))
    Y, X = np.mgrid[ya:yb, xa:xb].astype(np.float32)
    d = np.hypot(X - cx, Y - cy)
    v = np.clip((r - d) / soft + 0.5, 0, 1) * value
    cv[ya:yb, xa:xb] = np.maximum(cv[ya:yb, xa:xb], v)


def out(rgb, h=None, gloss=0.05, emit=None):
    rgb = np.clip(rgb, 0, 1).astype(np.float32)
    n = rgb.shape[0]
    h = np.full((n, n), 0.5, np.float32) if h is None else np.clip(h, 0, 1).astype(np.float32)
    if not hasattr(gloss, 'shape'):
        gloss = np.full((n, n), float(gloss), np.float32)
    return dict(rgb=rgb, h=h, gloss=np.clip(gloss, 0, 1).astype(np.float32), emit=emit)


# ------------------------------------------------------------------------------------------------ textures

def gen_bark(N=512):
    """Deep-fissured root bark: rounded plates between dark cracks, long along V (the path), warm browns, a little lichen."""
    V, U = grid(N)
    s = 11
    w = fbm(U, V, 3, 3, 3, s) - 0.5
    Uw = U + 0.05 * w
    n1 = fbm(Uw, V, 26, 4, 4, s + 1, 0.55)
    fis = np.abs(n1 - 0.5) * 2.0
    round_ = smoothstep(0.0, 0.5, fis)                 # 0 in the crack, rising across the plate
    plate = smoothstep(0.02, 0.18, fis)
    micro = fbm(U, V, 64, 64, 3, s + 3)
    stri = fbm(U, V, 150, 6, 2, s + 8)
    flake = fbm(U, V, 12, 40, 2, s + 9)
    broken = smoothstep(0.18, 0.3, fbm(U, V, 5, 14, 3, s + 2))      # patches where the crust has flaked off
    h = round_ * (0.78 + 0.12 * micro + 0.1 * stri) * (0.78 + 0.22 * broken)
    blot = fbm(U, V, 5, 5, 4, s + 4)
    c_dark, c_mid, c_hi = hexc('#140d0a'), hexc('#3f2d21'), hexc('#7e6347')
    col = mix(c_dark, c_mid, np.clip(plate, 0, 1))
    col = mix(col, c_hi, np.clip((h - 0.5) * 2.4, 0, 1) * (0.3 + 0.8 * blot))
    col = col * (0.78 + 0.44 * blot[..., None]) * (0.88 + 0.24 * stri[..., None])
    col = mix(col, hexc('#5a4030'), (1 - broken) * 0.45 * plate)
    lich = smoothstep(0.66, 0.8, fbm(U, V, 7, 7, 4, s + 5)) * plate
    col = mix(col, hexc('#7d8068'), lich * 0.35)
    warm = smoothstep(0.55, 0.75, fbm(U, V, 4, 4, 3, s + 6))
    col = mix(col, hexc('#8a5a34'), warm * 0.25 * plate)
    return out(col, h, 0.04 + 0.1 * lich)


def gen_plank(N=512):
    """Four old planks side by side (grain along V): knots, nail heads, dark seams, worn edges."""
    V, U = grid(N)
    nb = 4
    bi = np.floor(U * nb).astype(np.int64)
    bu = U * nb - bi
    rng = np.random.default_rng(5)
    tint = (0.78 + 0.34 * rng.random(nb)).astype(np.float32)[bi]
    off = rng.random(nb).astype(np.float32)[bi]
    wv = fbm(U, V, 4, 4, 3, 3) - 0.5
    X = U * 20 + wv * 2.0
    g1 = fbm(X / 20.0, (V + off) % 1.0, 20, 2, 4, 21, 0.5)
    bands = np.sin(g1 * 46.0 + fbm(U, V, 6, 3, 2, 22) * 4.0)
    line = smoothstep(0.55, 1.0, bands)
    fine = fbm(U, V, 120, 3, 2, 23)
    # knots
    kn = np.zeros_like(U)
    for (ku, kv, kr) in ((0.18, 0.34, 0.05), (0.62, 0.78, 0.04), (0.9, 0.12, 0.035)):
        dx = (U - ku + 0.5) % 1.0 - 0.5
        dy = (V - kv + 0.5) % 1.0 - 0.5
        r = np.hypot(dx * 1.0, dy * 0.6)
        kn = np.maximum(kn, smoothstep(kr * 2.4, kr * 0.4, r) * (0.55 + 0.45 * np.sin(r * 160)))
    seam = smoothstep(0.0, 0.035, bu) * smoothstep(0.0, 0.035, 1 - bu)
    c_dark, c_mid, c_hi = hexc('#2d1f15'), hexc('#6b4c32'), hexc('#a07c56')
    col = mix(c_mid, c_dark, np.clip(line * 0.8 + kn * 0.7, 0, 1))
    col = mix(col, c_hi, np.clip((fine - 0.55) * 2.5, 0, 1) * 0.5)
    col = col * tint[..., None]
    wear = smoothstep(0.65, 0.95, fbm(U, V, 7, 7, 4, 24))
    col = mix(col, hexc('#8a6a4c') * 0.9, wear * 0.3)
    col = col * (0.4 + 0.6 * seam)[..., None]
    h = (0.55 + 0.25 * (1 - line) + 0.1 * fine) * seam
    # nails near the ends of each board
    nails = np.zeros((N, N), np.float32)
    for b in range(nb):
        for v in (0.04, 0.5, 0.96):
            for du in (0.2, 0.8):
                draw_disc(nails, (b + du) / nb * N, v * N, 2.6, 1.0)
    col = mix(col, hexc('#2a2a30'), nails * 0.9)
    h = np.maximum(h, nails * 0.95)
    gl = 0.08 + 0.7 * nails + 0.15 * wear
    return out(col, h, gl)


def gen_rock(N=512):
    """Cave rock: broad plates with a few fine cracks, faint strata, cool grey with warm rusty bands and pale chips (triplanar)."""
    V, U = grid(N)
    wu = (fbm(U, V, 4, 4, 3, 6) - 0.5) * 0.3
    wv = (fbm(U, V, 4, 4, 3, 16) - 0.5) * 0.3
    f1, f2, cid = voronoi((U + wu) % 1.0, (V + wv) % 1.0, 4, 7, 0.95)
    edge = f2 - f1
    plate = smoothstep(0.0, 0.045, edge)
    big = fbm(U, V, 4, 4, 5, 8, 0.55)
    strata = 0.5 + 0.5 * np.sin((V * 11 + 2.6 * fbm(U, V, 3, 3, 3, 9) + U * 0.5) * 2 * PI)
    sp = fbm(U, V, 64, 64, 3, 10)
    mid = fbm(U, V, 14, 14, 4, 17)
    h = (0.62 + 0.38 * plate) * (0.45 + 0.35 * big + 0.2 * mid) + 0.12 * strata + 0.1 * sp
    rng = np.random.default_rng(12)
    celltone = rng.random(16).astype(np.float32)[cid]
    c_dark, c_mid, c_hi = hexc('#25252b'), hexc('#4b4b53'), hexc('#8a8a92')
    col = mix(c_dark, c_mid, np.clip(0.35 + big * 0.9 + (celltone - 0.5) * 0.4, 0, 1))
    col = mix(col, c_hi, np.clip((h - 0.58) * 2.4, 0, 1) * 0.65)
    col = mix(col, hexc('#5d4a40'), smoothstep(0.55, 0.9, strata) * 0.3 * smoothstep(0.4, 0.7, fbm(U, V, 3, 3, 3, 18)))
    col = col * (0.88 + 0.12 * plate)[..., None]
    col = col * (0.82 + 0.3 * sp[..., None]) * (0.9 + 0.2 * mid[..., None])
    vein = smoothstep(0.008, 0.0, np.abs(fbm(U, V, 4, 3, 3, 14) - 0.5)) * 0.2
    col = mix(col, hexc('#b8b4aa'), vein)
    return out(col, h, 0.06 + 0.2 * vein)


def gen_blocks(N=512):
    """Worn stone blocks in running bond (6 rows), dark mortar, chipped edges."""
    V, U = grid(N)
    rows = 6
    ri = np.floor(V * rows).astype(np.int64)
    rv = V * rows - ri
    rng = np.random.default_rng(31)
    col = np.zeros((N, N, 3), np.float32)
    h = np.zeros((N, N), np.float32)
    dist_u = np.zeros((N, N), np.float32)
    tone = np.zeros((N, N), np.float32)
    for r in range(rows):
        nbk = 3 + int(rng.integers(0, 2))
        wd = 0.6 + rng.random(nbk)
        b = np.cumsum(wd) / wd.sum()
        b = np.sort((b + rng.random()) % 1.0)
        ext = np.concatenate([[b[-1] - 1.0], b, [b[0] + 1.0]])
        m = ri == r
        us = U[m]
        idx = np.clip(np.searchsorted(ext, us, side='right') - 1, 0, len(ext) - 2)
        lo, hi = ext[idx], ext[idx + 1]
        dist_u[m] = np.minimum(us - lo, hi - us)
        bt = rng.random(len(ext)).astype(np.float32)
        tone[m] = bt[idx]
    dv = np.minimum(rv, 1 - rv) / rows
    d = np.minimum(dv * 2.0, dist_u)           # distance to the nearest mortar line, tile units
    face = smoothstep(0.004, 0.016, d)
    chips = fbm(U, V, 40, 40, 3, 33)
    big = fbm(U, V, 5, 5, 4, 34)
    h = face * (0.75 + 0.25 * chips) * (0.9 + 0.1 * smoothstep(0.016, 0.05, d))
    c_dark, c_mid, c_hi = hexc('#2a2328'), hexc('#5a4f54'), hexc('#8a7c7c')
    base = mix(c_mid, c_hi, np.clip(tone * 0.6 + big * 0.5 - 0.3, 0, 1))
    base = mix(c_dark, base, np.clip(0.55 + 0.45 * chips, 0, 1))
    mortar = hexc('#1a1517')
    col = mix(mortar, base * (0.75 + 0.5 * tone[..., None]), face)
    cr = smoothstep(0.006, 0.0, np.abs(fbm(U, V, 6, 6, 3, 35) - 0.5)) * face
    col = mix(col, c_dark * 0.7, cr * 0.35)
    return out(col, h, 0.07)


def gen_leather(N=512):
    """Worn leather: fine pebbled grain, deep creases, rubbed lighter patches."""
    V, U = grid(N)
    f1, f2, _ = voronoi(U, V, 36, 41, 0.9)
    pebble = smoothstep(0.0, 0.45, f2 - f1)
    crease = smoothstep(0.0, 0.05, np.abs(fbm(U, V, 4, 4, 4, 42) - 0.5) * 2.0)
    crease2 = smoothstep(0.0, 0.04, np.abs(fbm(U, V, 7, 6, 3, 43) - 0.5) * 2.0)
    worn = smoothstep(0.55, 0.78, fbm(U, V, 3, 3, 4, 44))
    h = (0.6 + 0.4 * pebble) * (0.35 + 0.65 * crease) * (0.6 + 0.4 * crease2)
    c_dark, c_mid, c_hi = hexc('#2c1a12'), hexc('#59392a'), hexc('#9a6c48')
    col = mix(c_dark, c_mid, np.clip(0.4 + 0.6 * h, 0, 1))
    col = mix(col, c_hi, worn * 0.55 * (0.5 + 0.5 * pebble))
    col = col * (0.85 + 0.3 * fbm(U, V, 6, 6, 4, 45)[..., None])
    return out(col, h, 0.18 + 0.5 * worn)


def gen_leather_n(N=512):
    """Neutral grey leather detail (pebbling, creases, rubbed patches) to be tinted to any book-cover colour."""
    d = gen_leather(N)
    v = d['rgb'][..., 0] * 1.0
    lo, hi = float(v.min()), float(v.max())
    g = 0.42 + 0.5 * (v - lo) / max(hi - lo, 1e-6)
    return out(np.stack([g, g, g], -1), d['h'], d['gloss'])


def gen_weave(N=512):
    """Plain woven cloth, neutral (tinted by the material): crossed threads and soft slubs."""
    V, U = grid(N)
    th = 90
    a = 0.5 + 0.5 * np.sin(U * th * 2 * PI)
    b = 0.5 + 0.5 * np.sin(V * th * 2 * PI)
    over = ((np.floor(U * th) + np.floor(V * th)) % 2).astype(np.float32)
    t = a * over + b * (1 - over)
    slub = fbm(U, V, 16, 2, 3, 51) * 0.5 + fbm(U, V, 2, 16, 3, 52) * 0.5
    v = 0.7 + 0.18 * t + 0.2 * slub
    col = np.stack([v, v, v], -1) * 0.9
    return out(col, 0.4 + 0.5 * t, 0.04)


def gen_quilt(N=512):
    """A patchwork quilt: 5 x 5 squares in earthy dyes, half with a contrasting triangle, stitched along the seams."""
    V, U = grid(N)
    n = 5
    pal = [hexc(c) for c in ('#8c3b2a', '#c4903a', '#2f6a66', '#d8c8a0', '#5a2f4a', '#4f5f30', '#2a3560', '#a8602e')]
    rng = np.random.default_rng(61)
    ci = np.floor(U * n).astype(np.int64)
    cj = np.floor(V * n).astype(np.int64)
    cu = U * n - ci
    cv = V * n - cj
    k1 = rng.integers(0, len(pal), (n, n))
    k2 = (k1 + 1 + rng.integers(0, len(pal) - 1, (n, n))) % len(pal)
    kind = rng.integers(0, 3, (n, n))
    P = np.array(pal, np.float32)
    c1 = P[k1[cj, ci]]
    c2 = P[k2[cj, ci]]
    kd = kind[cj, ci]
    tri_ = np.where(kd == 0, cu + cv < 1.0, np.where(kd == 1, cu > cv, (np.abs(cu - 0.5) + np.abs(cv - 0.5)) < 0.42))
    col = np.where(tri_[..., None], c2, c1)
    wv = gen_weave(N)
    col = col * (0.7 + 0.5 * wv['rgb'][..., :1])
    seam = np.minimum(np.minimum(cu, 1 - cu), np.minimum(cv, 1 - cv))
    stitch = (smoothstep(0.045, 0.03, seam) * smoothstep(0.02, 0.03, seam)) * (0.5 + 0.5 * np.sin(U * n * 70)) * 0.0
    sline = np.zeros((N, N), np.float32)
    for k in range(n + 1):
        p = int(k * N / n) % N
        for q in range(0, N, 14):
            draw_line(sline, (p + 5, q), (p + 5, q + 7), 0.9, 1.0, 0.8)
            draw_line(sline, (q, p + 5), (q + 7, p + 5), 0.9, 1.0, 0.8)
    col = mix(col, hexc('#e8dcc0'), sline * 0.55)
    puff = np.sin(cu * PI) * np.sin(cv * PI)
    col = col * (0.82 + 0.3 * puff[..., None])
    col = col * (0.85 + 0.3 * fbm(U, V, 8, 8, 3, 62)[..., None])
    return out(col, 0.3 + 0.55 * puff * (0.7 + 0.3 * wv['h']), 0.04)


def gen_curtain(N=512):
    """Plum velvet-ish curtain: soft vertical streaking, a gold hem band and stitched crescents low on the cloth (V runs down)."""
    V, U = grid(N)
    streak = fbm(U, V, 28, 2, 3, 71)
    c_dark, c_mid = hexc('#2c1226'), hexc('#5a2a48')
    col = mix(c_dark, c_mid, np.clip(0.3 + streak * 0.9, 0, 1))
    col = col * (0.88 + 0.24 * fbm(U, V, 6, 6, 3, 72)[..., None])
    gold = np.zeros((N, N), np.float32)
    # hem bands at the bottom (V ~ 0.9..1)
    for v, wdt in ((0.93, 3.0), (0.955, 1.2), (0.985, 3.0)):
        draw_line(gold, (0, v * N), (N, v * N), wdt, 1.0, 1.2)
    # crescents in a row above the hem
    for k in range(4):
        cx = (k + 0.5) / 4 * N
        cy = 0.82 * N
        draw_ring(gold, cx, cy, 15, 2.0, 1.0, 1.2, a0=0.7, a1=2 * PI - 0.7)
        draw_ring(gold, cx + 6, cy, 12, 1.4, 0.0, 1.2)
        draw_disc(gold, cx + 20, cy - 12, 1.8, 1.0)
    col = mix(col, hexc('#c9a14a'), gold * 0.85)
    return out(col, 0.5 + 0.2 * streak + 0.2 * gold, 0.05 + 0.35 * gold)


def gen_rug(N=512):
    """A round rug (NOT tiling: u, v run 0..1 across the disc): concentric bands, a star medallion, woven noise."""
    V, U = grid(N)
    x, y = (U - 0.5) * 2, (V - 0.5) * 2
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    red, ochre, teal, cream, navy, plum = (hexc(c) for c in ('#7a2a22', '#c08a3a', '#2c6a6a', '#d8c8a0', '#232d52', '#5a2f4a'))
    col = np.zeros((N, N, 3), np.float32) + red
    # field
    col = mix(col, plum, smoothstep(0.55, 0.7, fbm(U, V, 4, 4, 3, 81)) * 0.5)
    # outer border bands (r 0.82 .. 1.0)
    band1 = (r > 0.92) & (r < 0.985)
    band2 = (r > 0.80) & (r < 0.9)
    col = np.where(band1[..., None], navy, col)
    col = np.where(band2[..., None], teal, col)
    zig = (np.abs(((a / (2 * PI) * 48) % 1.0) - 0.5) * 2 * 0.1 + 0.80 < r) & (r < 0.9) & (r > 0.80)
    col = np.where(zig[..., None], cream, col)
    dash = (((a / (2 * PI) * 64) % 1.0) < 0.5) & (r > 0.935) & (r < 0.97)
    col = np.where(dash[..., None], ochre, col)
    ring_l = (np.abs(r - 0.78) < 0.012) | (np.abs(r - 0.455) < 0.012) | (np.abs(r - 0.975) < 0.006)
    col = np.where(ring_l[..., None], cream, col)
    # petals ring (r 0.46 .. 0.77)
    petal = np.abs(np.sin(a * 8 / 2.0)) ** 0.7 * 0.3 + 0.46
    pm = (r > 0.5) & (r < petal + 0.0) & (r < 0.76)
    col = np.where(pm[..., None], ochre, col)
    pm2 = (r > 0.5) & (r < petal - 0.06) & (r < 0.72)
    col = np.where(pm2[..., None], red * 1.15, col)
    # medallion: eight-point star + moon
    star = r < (0.30 + 0.12 * np.abs(np.cos(a * 4))) * 0.95
    col = np.where((star & (r > 0.0))[..., None], navy, col)
    star2 = r < (0.22 + 0.1 * np.abs(np.cos(a * 4))) * 0.9
    col = np.where(star2[..., None], teal, col)
    moon = (np.hypot(x + 0.0, y) < 0.14) & (np.hypot(x - 0.06, y - 0.02) > 0.115)
    col = np.where(moon[..., None], cream, col)
    col = np.where((r > 1.0)[..., None], red * 0.5, col)
    w = gen_weave(N)
    col = col * (0.62 + 0.55 * w['rgb'][..., :1])
    col = col * (0.82 + 0.3 * fbm(U, V, 10, 10, 4, 82)[..., None])
    return out(col, 0.35 + 0.5 * w['h'], 0.04)


def gen_brew(N=512):
    """The cauldron brew, from straight above (u, v across the disc): swirling green and violet, bright wisps, a foam ring, bubbles."""
    V, U = grid(N)
    x, y = (U - 0.5) * 2, (V - 0.5) * 2
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    warp = fbm(U, V, 4, 4, 4, 91)
    arm = 0.5 + 0.5 * np.sin(a * 3 + r * 11.0 + warp * 5.0)
    arm2 = 0.5 + 0.5 * np.sin(a * 2 - r * 7.0 + warp * 6.0 + 1.3)
    green, violet, lime = hexc('#38e070'), hexc('#8f55ee'), hexc('#a8f060')
    deep_g, deep_v = hexc('#14884a'), hexc('#52289a')
    col = mix(mix(deep_g, green, smoothstep(0.3, 0.7, arm2)), mix(deep_v, violet, smoothstep(0.3, 0.7, arm2)), smoothstep(0.38, 0.62, arm))
    wisp = smoothstep(0.88, 1.0, 0.5 + 0.5 * np.sin(a * 5 - r * 16 + warp * 7.0))
    col = mix(col, lime, wisp * 0.55)
    col = col * (0.85 + 0.3 * fbm(U, V, 12, 12, 4, 92)[..., None])
    foam = smoothstep(0.84, 0.97, r) * (0.4 + 0.6 * fbm(U, V, 24, 24, 3, 93))
    col = mix(col, hexc('#a8ffc0'), foam * 0.5)
    bub = np.zeros((N, N), np.float32)
    rng = np.random.default_rng(94)
    for _ in range(22):
        rr = rng.random() * 0.8
        aa = rng.random() * 2 * PI
        cx, cy = N * (0.5 + 0.5 * rr * math.cos(aa)), N * (0.5 + 0.5 * rr * math.sin(aa))
        rad = 3 + rng.random() * 9
        draw_ring(bub, cx, cy, rad, 1.3, 1.0, 1.0)
        draw_disc(bub, cx - rad * 0.3, cy - rad * 0.3, rad * 0.22, 1.0)
    col = mix(col, hexc('#c8ffd8'), bub * 0.6)
    col = np.where((r > 1.0)[..., None], green * 0.5, col)
    return out(col, 0.5 + 0.2 * bub, 0.6, emit=np.ones((N, N), np.float32))


def _glyph(cv, cx, cy, ang, size, rng, w=1.8):
    """A made-up rune: a stem with a few branches and ticks, rotated by ang, centred at (cx, cy)."""
    ca, sa = math.cos(ang), math.sin(ang)

    def P(px, py):
        return (cx + (px * ca - py * sa) * size, cy + (px * sa + py * ca) * size)

    segs = [((0, -1), (0, 1))]
    for _ in range(int(rng.integers(2, 5))):
        y0 = rng.random() * 2 - 1
        x1 = (rng.random() * 1.2 - 0.6)
        y1 = y0 + (rng.random() - 0.5) * 1.2
        segs.append(((0, y0), (x1, y1)))
    if rng.random() < 0.5:
        segs.append(((-0.5, -0.2), (0.5, -0.2)))
    for a, b in segs:
        draw_line(cv, P(*a), P(*b), w, 1.0, 1.1)


def gen_runes(N=1024):
    """The dais top, from above (u, v across the disc, centre = the disc centre, NOT tiling): stone with a ring of carved,
    glowing runes between two rings (r 0.58 .. 0.96) and a thin inner circle.  emit = rune mask."""
    V, U = grid(N)
    x, y = (U - 0.5) * 2, (V - 0.5) * 2
    r = np.hypot(x, y)
    base = gen_blocks(N)
    n = fbm(U, V, 5, 5, 4, 101)
    c0, c1 = hexc('#3a3237'), hexc('#6a5d62')
    col = mix(c0, c1, np.clip(n * 1.1, 0, 1))
    col = col * (0.85 + 0.3 * base['h'][..., None])
    cv = np.zeros((N, N), np.float32)
    c = N / 2
    for rr in (0.70, 0.95, 0.97):
        draw_ring(cv, c, c, rr * c, 1.8 if rr < 0.96 else 1.0, 1.0, 1.2)
    rng = np.random.default_rng(102)
    nglyph = 32
    for k in range(nglyph):
        ang = 2 * PI * k / nglyph
        rg = 0.83 * c
        _glyph(cv, c + rg * math.cos(ang), c + rg * math.sin(ang), ang + PI / 2, 0.07 * c, rng, 2.0)
    # a few small crescents between glyph groups
    for k in range(8):
        ang = 2 * PI * (k + 0.5) / 8
        px, py = c + 0.83 * c * math.cos(ang), c + 0.83 * c * math.sin(ang)
        draw_ring(cv, px, py, 8, 1.4, 0.0, 1.0)
    glow = cv
    col = mix(col, hexc('#a8f0ff'), np.clip(glow * 1.2, 0, 1))
    h = 0.6 * base['h'] - 0.35 * glow
    return out(col, h + 0.3, 0.1, emit=glow)


def gen_sigil(N=1024):
    """The Gate of Roots' round door, from the front (u, v across the disc): rough stone, a great crescent moon in a ring of
    ticks with an eight-point star above it.  emit = the carving."""
    V, U = grid(N)
    x, y = (U - 0.5) * 2, (V - 0.5) * 2
    r = np.hypot(x, y)
    rk = gen_rock(N)
    col = rk['rgb'] * 0.95 + 0.02
    cv = np.zeros((N, N), np.float32)
    c = N / 2
    for rr, wd in ((0.93, 3.0), (0.86, 1.5), (0.40, 1.5)):
        draw_ring(cv, c, c, rr * c, wd, 1.0, 1.4)
    for k in range(48):
        ang = 2 * PI * k / 48
        r0, r1 = 0.865 * c, (0.915 if k % 4 else 0.925) * c
        draw_line(cv, (c + r0 * math.cos(ang), c + r0 * math.sin(ang)), (c + r1 * math.cos(ang), c + r1 * math.sin(ang)), 1.6, 1.0, 1.2)
    # the crescent: big disc minus a shifted disc
    Y, X = np.mgrid[0:N, 0:N].astype(np.float32)
    d1 = np.hypot(X - c, Y - (c + 0.06 * c))
    d2 = np.hypot(X - (c + 0.17 * c), Y - (c - 0.0 * c))
    cres = np.clip((0.56 * c - d1) / 1.5 + 0.5, 0, 1) * np.clip((d2 - 0.46 * c) / 1.5 + 0.5, 0, 1)
    cv_c = cres
    # engrave a rim line inside the crescent so it reads carved
    inner = np.clip((0.50 * c - d1) / 1.5 + 0.5, 0, 1) * np.clip((d2 - 0.52 * c) / 1.5 + 0.5, 0, 1)
    glow = np.maximum(cv, cv_c * (1 - 0.18 * inner))
    # star above-left of centre
    sx, sy = c - 0.02 * c, c - 0.30 * c
    for k in range(8):
        ang = 2 * PI * k / 8
        ln = 0.14 * c if k % 2 == 0 else 0.07 * c
        draw_line(glow, (sx, sy), (sx + ln * math.cos(ang), sy + ln * math.sin(ang)), 2.2, 1.0, 1.2)
    draw_disc(glow, sx, sy, 4.0, 1.0)
    # little runes around the inner ring
    rng = np.random.default_rng(111)
    for k in range(12):
        ang = 2 * PI * (k + 0.5) / 12
        rg = 0.66 * c
        if abs(math.sin(ang - 0.0)) > -1:
            _glyph(glow, c + rg * math.cos(ang), c + rg * math.sin(ang), ang + PI / 2, 0.05 * c, rng, 1.6)
    col = mix(col, hexc('#9ed4e6'), np.clip(glow * 0.95, 0, 1))
    h = 0.55 * rk['h'] + 0.25 - 0.28 * glow
    return out(col, h, 0.08, emit=np.clip(glow, 0, 1))


def gen_pages(N=512):
    """An open grimoire seen from above: left page = lines of script and a drop capital, right page = a glowing arcane diagram.
    u 0..0.5 left page, 0.5..1 right page, V runs from the top of the pages down. emit: faint on the paper, strong on the diagram."""
    V, U = grid(N)
    paper = mix(hexc('#a8a08a'), hexc('#d6cdb0'), np.clip(fbm(U, V, 6, 6, 4, 121) * 1.1, 0, 1))
    # gutter shadow
    gut = np.exp(-(((U - 0.5) / 0.035) ** 2))
    paper = paper * (1 - 0.45 * gut)[..., None]
    paper = paper * (0.86 + 0.2 * fbm(U, V, 3, 3, 3, 122)[..., None])
    ink = np.zeros((N, N), np.float32)
    rng = np.random.default_rng(123)
    # left page: lines of dashes
    for row in range(16):
        y = N * (0.12 + row * 0.052)
        x = N * 0.07
        if row == 0:
            draw_disc(ink, x + 14, y + 6, 12, 1.0)
            x += 40
        end = N * (0.46 - rng.random() * 0.05 * (row % 3 == 2))
        while x < end:
            ln = 5 + rng.random() * 18
            draw_line(ink, (x, y), (min(x + ln, end), y), 1.1, 1.0, 1.0)
            x += ln + 5 + rng.random() * 5
    # right page: arcane circles
    glow = np.zeros((N, N), np.float32)
    cx, cy = N * 0.75, N * 0.46
    for rr, w in ((0.19, 1.4), (0.165, 0.9), (0.09, 1.1)):
        draw_ring(glow, cx, cy, rr * N, w, 1.0, 1.0)
    for k in range(6):
        ang = 2 * PI * k / 6 + 0.3
        p0 = (cx + 0.165 * N * math.cos(ang), cy + 0.165 * N * math.sin(ang))
        p1 = (cx + 0.165 * N * math.cos(ang + 2 * PI / 3), cy + 0.165 * N * math.sin(ang + 2 * PI / 3))
        draw_line(glow, p0, p1, 1.0, 1.0, 1.0)
    draw_ring(glow, cx + 4, cy, 0.05 * N, 1.4, 1.0, 1.0, a0=0.9, a1=2 * PI - 0.9)
    for row in range(4):
        y = N * (0.76 + row * 0.052)
        x = N * 0.56
        while x < N * 0.94:
            ln = 5 + rng.random() * 18
            draw_line(ink, (x, y), (min(x + ln, N * 0.94), y), 1.1, 1.0, 1.0)
            x += ln + 5 + rng.random() * 5
    col = mix(paper, hexc('#2a2018'), np.clip(ink, 0, 1) * 0.85)
    col = mix(col, hexc('#5fe8d6'), np.clip(glow, 0, 1))
    emit = 0.45 * (1 - np.clip(ink, 0, 1) * 0.9) * (1 - 0.45 * gut) + np.clip(glow, 0, 1) * 0.55
    return out(col, 0.5 - 0.15 * ink + 0.1 * glow, 0.04, emit=np.clip(emit, 0, 1))


def gen_wicker(N=512):
    """Basket weave (u around, v up): over-under strands with a bump."""
    V, U = grid(N)
    nu, nv = 24, 16
    cu = U * nu
    cv = V * nv
    iu = np.floor(cu)
    iv = np.floor(cv)
    fu = cu - iu
    fv = cv - iv
    over = ((iu + iv) % 2) == 0
    hu = np.sin(fu * PI) ** 0.6
    hv = np.sin(fv * PI) ** 0.6
    # vertical stakes (thin, always visible between) and horizontal weavers
    h = np.where(over, 0.55 + 0.45 * hv, 0.25 + 0.35 * hu * hv)
    rng = np.random.default_rng(131)
    tone = rng.random((nv + 1, nu + 1)).astype(np.float32)[iv.astype(int), iu.astype(int)]
    c_dark, c_mid, c_hi = hexc('#3a2814'), hexc('#7c5a30'), hexc('#b08a52')
    col = mix(c_dark, c_mid, np.clip(h * 1.1, 0, 1))
    col = mix(col, c_hi, np.clip((h - 0.6) * 2.0, 0, 1) * (0.4 + 0.6 * tone))
    col = col * (0.82 + 0.3 * tone[..., None])
    col = col * (0.85 + 0.25 * fbm(U, V, 10, 10, 3, 132)[..., None])
    return out(col, h, 0.1)


def gen_hammered(N=512):
    """Black hand-forged iron: hammer dimples, scale and soot, a little rust."""
    V, U = grid(N)
    f1, f2, _ = voronoi(U, V, 14, 141, 0.95)
    dimple = smoothstep(0.0, 0.7, f1)
    n = fbm(U, V, 6, 6, 4, 142)
    c_dark, c_mid, c_hi = hexc('#0e0d10'), hexc('#27262c'), hexc('#4d4c55')
    col = mix(c_dark, c_mid, np.clip(0.3 + n * 0.8, 0, 1))
    col = mix(col, c_hi, np.clip((dimple - 0.55) * 1.5, 0, 1) * 0.5)
    rust = smoothstep(0.62, 0.8, fbm(U, V, 5, 5, 4, 143))
    col = mix(col, hexc('#5a3220'), rust * 0.5)
    return out(col, 0.3 + 0.7 * dimple, 0.35 + 0.25 * (1 - rust))


def gen_embers(N=512):
    """A bed of embers: glowing orange cells under a cracked black crust. emit = the glow."""
    V, U = grid(N)
    f1, f2, _ = voronoi(U, V, 9, 151, 0.95)
    crack = smoothstep(0.02, 0.22, f2 - f1)         # 0 on cracks (glowing), 1 on crust
    glow = (1 - crack) * (0.55 + 0.45 * fbm(U, V, 12, 12, 3, 152)) + 0.25 * smoothstep(0.55, 0.9, fbm(U, V, 6, 6, 3, 153)) * crack
    hot = smoothstep(0.55, 1.0, glow)
    col = mix(hexc('#1c1310'), hexc('#ff5a1a'), np.clip(glow, 0, 1))
    col = mix(col, hexc('#ffc060'), hot * 0.8)
    return out(col, 0.3 + 0.5 * crack, 0.15, emit=np.clip(glow * 1.1, 0, 1))


def gen_slate(N=512):
    """Dark roof/floor slate with faint warm veins for the gate's threshold and the hearth."""
    V, U = grid(N)
    n = fbm(U, V, 6, 6, 4, 161)
    col = mix(hexc('#26222a'), hexc('#4a4147'), np.clip(n * 1.2, 0, 1))
    return out(col, n, 0.1)


NAMES = dict(leather_n=gen_leather_n, bark=gen_bark, plank=gen_plank, rock=gen_rock, blocks=gen_blocks, leather=gen_leather, weave=gen_weave,
             quilt=gen_quilt, curtain=gen_curtain, rug=gen_rug, brew=gen_brew, runes=gen_runes, sigil=gen_sigil,
             pages=gen_pages, wicker=gen_wicker, hammered=gen_hammered, embers=gen_embers, slate=gen_slate)


def get(name):
    if name not in _cache:
        _cache[name] = NAMES[name]()
    return _cache[name]
