"""Helpers for the Toy Tanks stage props (run inside Blender, headless). Builds on lib.py.

Props are modelled in millimetres like the tanks, in world space: the origin is the middle of the base, +Z is up, and the front
(the side the camera sees) is -Y, so after the glTF export (+Y up) the front faces +Z, the game camera. Each prop is one empty
named after the prop with a few mesh children (one per group of materials that share UVs).

Texture coordinates are in TEXTURE TILES (the game sets repeat = 1): each part is unwrapped with the tile size that makes the
photographed grain look right at toy scale (see uv_* below). Vertex colours are a linear multiplier on the material colour, used for
weathering, wetness, painted stripes and spots, so a prop needs no texture of its own.
"""
import math
import os
import random
import bmesh
import bpy
from math import pi, sin, cos, atan2, sqrt, exp, radians, floor, ceil
from mathutils import Vector, Matrix, noise
import lib

MM = 0.001
UVN = 'UVMap'
COLN = 'Col'
# materials the game replaces with a photographed set from assets/tex (props.js). Each carries a 1x1 stand-in texture so gltfpack keeps
# a KHR_texture_transform for the quantised UVs, which the game copies onto the real set.
PBR_NAMES = ('sand-wet', 'wood', 'rope', 'bark', 'moss', 'soil')


# --------------------------------------------------------------------------------------- colour

def lin1(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def srgb(hexv):
    """0xRRGGBB (sRGB) -> linear (r, g, b)."""
    return tuple(lin1(((hexv >> s) & 255) / 255.0) for s in (16, 8, 0))


def mixc(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def scale_c(c, k):
    return tuple(x * k for x in c)


# --------------------------------------------------------------------------------------- materials

def make_mat(name, color=0xffffff, rough=0.5, metal=0.0, coat=0.0, coat_rough=0.1, sheen=0.0, sheen_rough=0.5, spec=0.5, vcol=True):
    """A Principled material. With vcol the base colour is (vertex colour x colour), which the glTF exporter writes as COLOR_0 + a factor."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    rgb = (*srgb(color), 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Sheen Roughness'].default_value = sheen_rough
    for k in ('Specular IOR Level',):
        if k in b.inputs:
            b.inputs[k].default_value = spec
    m.diffuse_color = rgb
    m.use_backface_culling = True
    if vcol:
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = COLN
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        if name in PBR_NAMES:
            img = bpy.data.images.get('white1x1')
            if img is None:
                img = bpy.data.images.new('white1x1', 1, 1)
                img.pixels = [1.0, 1.0, 1.0, 1.0]
                img.pack()
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.name = 'pbr_col'
            tex.image = img
            nt.links.new(tex.outputs['Color'], mix.inputs[6])
            nt.links.new(attr.outputs['Color'], mix.inputs[7])
        else:
            nt.links.new(attr.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = rgb
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = rgb
    m['flat_color'] = rgb
    return m


PBR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'tex')


def textured_preview(m, pbr, nrm_strength=1.0):
    """Swap a material's colour, normal and roughness for the game's photographed set (only for preview pictures, never exported)."""
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    col = nt.nodes.new('ShaderNodeTexImage')
    col.image = bpy.data.images.load(os.path.join(PBR_DIR, f'{pbr}-col.webp'))
    nrm = nt.nodes.new('ShaderNodeTexImage')
    nrm.image = bpy.data.images.load(os.path.join(PBR_DIR, f'{pbr}-nrm.webp'))
    nrm.image.colorspace_settings.name = 'Non-Color'
    orm = nt.nodes.new('ShaderNodeTexImage')
    orm.image = bpy.data.images.load(os.path.join(PBR_DIR, f'{pbr}-orm.webp'))
    orm.image.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = nrm_strength
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(nrm.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(orm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
    stand = nt.nodes['pbr_col']
    stand.image = col.image
    stand.interpolation = 'Smart'
    nt.nodes.remove(col)
    col = stand
    for im in (nrm, orm):
        im.interpolation = 'Smart'


# --------------------------------------------------------------------------------------- layers, merge, colour

def layers(bm):
    uv = bm.loops.layers.uv.get(UVN) or bm.loops.layers.uv.new(UVN)
    col = bm.verts.layers.float_color.get(COLN) or bm.verts.layers.float_color.new(COLN)
    return uv, col


def merge(dst, src, matrix=None):
    """lib.merge plus texture coordinates and vertex colours."""
    suv = src.loops.layers.uv.get(UVN)
    scol = src.verts.layers.float_color.get(COLN)
    duv = dcol = None
    if suv is not None or scol is not None:
        duv, dcol = layers(dst)
    vm = {}
    inv = {}
    for v in src.verts:
        co = matrix @ v.co if matrix is not None else v.co.copy()
        nv = dst.verts.new(co)
        vm[v] = nv
        inv[nv] = v
        if scol is not None:
            nv[dcol] = v[scol]
    flip = matrix is not None and matrix.determinant() < 0
    for f in src.faces:
        vs = [vm[v] for v in f.verts]
        if flip:
            vs.reverse()
        try:
            nf = dst.faces.new(vs)
        except ValueError:
            continue
        nf.material_index = f.material_index
        nf.smooth = f.smooth
        if suv is not None:
            sl = {l.vert: l for l in f.loops}
            for l in nf.loops:
                l[duv].uv = sl[inv[l.vert]][suv].uv
    for e in src.edges:
        if not e.smooth:
            ee = dst.edges.get((vm[e.verts[0]], vm[e.verts[1]]))
            if ee:
                ee.smooth = False
    return dst


def add(dst, *srcs):
    for s in srcs:
        merge(dst, s)
    return dst


def paint(bm, fn):
    """Set vertex colours: fn(co, normal, material_index) -> linear (r, g, b) multiplier."""
    _, col = layers(bm)
    bm.normal_update()
    for v in bm.verts:
        mi = v.link_faces[0].material_index if v.link_faces else 0
        r, g, b = fn(v.co, v.normal, mi)
        v[col] = (r, g, b, 1.0)
    return bm


def paint_flat(bm, c=(1.0, 1.0, 1.0)):
    return paint(bm, lambda co, n, mi: c)


def fill_unset_colours(bm):
    col = bm.verts.layers.float_color.get(COLN)
    if col is None:
        return
    for v in bm.verts:
        if v[col][3] < 0.5:
            v[col] = (1.0, 1.0, 1.0, 1.0)


# --------------------------------------------------------------------------------------- texture coordinates

def uv_set(bm, fn):
    """fn(face, vert) -> (u, v) for every corner."""
    uv, _ = layers(bm)
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = fn(f, l.vert)
    return bm


def dominant(n):
    ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
    return 0 if ax >= ay and ax >= az else (1 if ay >= az else 2)


def uv_box(bm, tile, off=(0.0, 0.0), rot=0.0):
    """Box projection at `tile` millimetres per texture repeat: even grain at any angle, for sand, soil, moss, cloth."""
    c, s = cos(rot), sin(rot)

    def f(face, v):
        a = dominant(face.normal)
        p = v.co
        u, w = ((p.y, p.z), (p.x, p.z), (p.x, p.y))[a]
        u, w = u / tile, w / tile
        return (u * c - w * s + off[0], u * s + w * c + off[1])
    return uv_set(bm, f)


def uv_cyl(bm, tile, axis=2, center=(0.0, 0.0), off=(0.0, 0.0), around_scale=1.0):
    """Cylindrical projection about a vertical (axis 2) or lengthwise x (axis 0) axis: u round the surface, v along it.
    Every face is unwrapped relative to its own angle, so there is no seam smear (only a jump in the texture at one line)."""
    def ang(p):
        if axis == 2:
            return atan2(p.y - center[1], p.x - center[0]), math.hypot(p.x - center[0], p.y - center[1]), p.z
        return atan2(p.z - center[1], p.y - center[0]), math.hypot(p.y - center[0], p.z - center[1]), p.x

    def f(face, v):
        cx = sum(x.co.x for x in face.verts) / len(face.verts)
        cy = sum(x.co.y for x in face.verts) / len(face.verts)
        cz = sum(x.co.z for x in face.verts) / len(face.verts)
        a0, r0, _ = ang(Vector((cx, cy, cz)))
        a, r, h = ang(v.co)
        d = a - a0
        while d > pi:
            d -= 2 * pi
        while d < -pi:
            d += 2 * pi
        return ((a0 + d) * max(r0, 1.0) * around_scale / tile + off[0], h / tile + off[1])
    return uv_set(bm, f)


# The photographed plank sheet (assets/tex/wood-col.webp): 9 boards across 1024 px, with a black gap between them.
WOOD_SLOTS = [(4, 126), (130, 248), (252, 360), (364, 470), (474, 575), (579, 680), (684, 795), (799, 905), (909, 1020)]


def uv_wood(bm, tile, grain=0, seed=0, slot=None):
    """Unwrap one board or beam so that it shows the grain of ONE board of the photograph: the grain runs along `grain` (0 = x,
    1 = y, 2 = z), the width uses a slice of a single board (so no black gap line shows) and each part starts somewhere different.
    `tile` is the millimetres one texture repeat covers (1000 = real scale)."""
    rnd = random.Random(seed)
    k = slot if slot is not None else rnd.randrange(9)
    s0, s1 = WOOD_SLOTS[k]
    ext = [(min(v.co[i] for v in bm.verts), max(v.co[i] for v in bm.verts)) for i in range(3)]
    span = (s1 - s0 - 8) / 1024.0 * tile  # mm of board that can be used
    width_axes = [i for i in range(3) if i != grain]
    wmax = max(ext[i][1] - ext[i][0] for i in width_axes)
    u_start = (s0 + 4 + rnd.random() * max(0.0, (s1 - s0 - 8) - wmax / tile * 1024.0)) / 1024.0 if wmax < span else s0 / 1024.0
    v_start = rnd.random()

    def f(face, v):
        a = dominant(face.normal)
        p = v.co
        if a == grain:  # an end face: any two axes
            ax = width_axes
            return ((p[ax[0]] - ext[ax[0]][0]) / tile + u_start, (p[ax[1]] - ext[ax[1]][0]) / tile + v_start)
        other = [i for i in range(3) if i != a and i != grain][0]
        return ((p[other] - ext[other][0]) / tile + u_start, (p[grain] - ext[grain][0]) / tile + v_start)
    return uv_set(bm, f)


# --------------------------------------------------------------------------------------- geometry builders

def grid(fn, nu, nv, wrap_u=False, wrap_v=False, mat=0, uvfn=None):
    """A quad grid over (u, v) in [0,1]^2. fn(u, v) -> Vector. wrap_* joins the last row/column to the first (a ring) while the
    texture coordinates (uvfn(u, v) -> (U, V), unwrapped so the seam gets u = 1) stay continuous."""
    bm = lib.bm_new()
    cu = nu if wrap_u else nu + 1
    cv = nv if wrap_v else nv + 1
    vs = [[bm.verts.new(fn(i / nu, j / nv)) for j in range(cv)] for i in range(cu)]
    uvl = bm.loops.layers.uv.verify() if uvfn else None
    for i in range(nu):
        for j in range(nv):
            i2, j2 = i + 1, j + 1
            quad = [vs[i % cu][j % cv], vs[i2 % cu][j % cv], vs[i2 % cu][j2 % cv], vs[i % cu][j2 % cv]]
            if len({id(x) for x in quad}) < 4:
                if len({id(x) for x in quad}) < 3:
                    continue
                seen = []
                q2 = []
                for x in quad:
                    if all(x is not y for y in seen):
                        seen.append(x)
                        q2.append(x)
                quad = q2
            f = bm.faces.new(quad)
            f.material_index = mat
            if uvfn and len(quad) == 4:
                pts = [(i, j), (i2, j), (i2, j2), (i, j2)]
                for l, (ii, jj) in zip(f.loops, pts):
                    l[uvl].uv = uvfn(ii / nu, jj / nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def solid_from_grid(fn, nu, nv, thick, mat=0, back_fn=None, edge_round=True):
    """A thin closed shell: the surface fn(u, v) plus a copy `thick` mm below it (along the surface normal), joined round the rim.
    The front surface is the (u, v) grid with faces facing out."""
    P = [[Vector(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]

    def nrm(i, j):
        a = P[min(i + 1, nu)][j] - P[max(i - 1, 0)][j]
        b = P[i][min(j + 1, nv)] - P[i][max(j - 1, 0)]
        n = a.cross(b)
        return n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))
    bm = lib.bm_new()
    top = [[bm.verts.new(P[i][j]) for j in range(nv + 1)] for i in range(nu + 1)]
    bot = []
    for i in range(nu + 1):
        row = []
        for j in range(nv + 1):
            n = nrm(i, j)
            t = thick * (back_fn(i / nu, j / nv) if back_fn else 1.0)
            # the rim is rounded: the back surface pulls in towards the edge
            row.append(bm.verts.new(P[i][j] - n * t))
        bot.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new([top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]])
            bm.faces.new([bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]])
    for i in range(nu):
        bm.faces.new([top[i][0], bot[i][0], bot[i + 1][0], top[i + 1][0]])
        bm.faces.new([top[i][nv], top[i + 1][nv], bot[i + 1][nv], bot[i][nv]])
    for j in range(nv):
        bm.faces.new([top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j]])
        bm.faces.new([top[nu][j], bot[nu][j], bot[nu][j + 1], top[nu][j + 1]])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    lib.set_mat(bm, mat)
    return bm


def perp_frame(t):
    t = Vector(t).normalized()
    ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
    u = t.cross(ref).normalized()
    v = t.cross(u).normalized()
    return u, v


def tube(path, radius, sides=10, mat=0, caps=True, twist=None, rope_uv=None, round_ends=0.0, cap_mat=None, cap_rings_n=6):
    """Sweep a circle along a polyline (mm). `radius` is a number or fn(s, theta) with s in [0,1] along the path.
    rope_uv=(strands, lay) makes texture coordinates that wind the photographed rope round the tube like real plied rope.
    round_ends > 0 shrinks the radius near each end so the tube ends in a dome."""
    n = len(path)
    pts = [Vector(p) for p in path]
    lens = [0.0]
    for i in range(1, n):
        lens.append(lens[-1] + (pts[i] - pts[i - 1]).length)
    total = lens[-1] or 1.0
    # rotation-minimising frames
    tans = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        tans.append((b - a).normalized())
    u0, v0 = perp_frame(tans[0])
    frames = []
    for i in range(n):
        if i > 0:
            axis = tans[i - 1].cross(tans[i])
            if axis.length > 1e-9:
                ang = math.asin(min(1.0, axis.length))
                R = Matrix.Rotation(ang, 3, axis.normalized())
                u0 = R @ u0
                v0 = R @ v0
        u0 = (u0 - tans[i] * u0.dot(tans[i])).normalized()
        v0 = tans[i].cross(u0).normalized()
        frames.append((u0.copy(), v0.copy()))
    bm = lib.bm_new()
    uvl = bm.loops.layers.uv.verify() if rope_uv else None
    ring = []
    rf = radius if callable(radius) else (lambda s, th, r=radius: r)
    for i in range(n):
        s = lens[i] / total
        e = 1.0
        if round_ends > 0:
            d = min(lens[i], total - lens[i])
            e = sqrt(max(0.0, 1.0 - max(0.0, 1.0 - d / round_ends) ** 2))
        u, v = frames[i]
        row = []
        for k in range(sides):
            th = 2 * pi * k / sides
            r = rf(s, th) * e
            row.append(bm.verts.new(pts[i] + (u * cos(th) + v * sin(th)) * r))
        ring.append(row)
    circ = 2 * pi * (rf(0.5, 0.0))
    for i in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            f = bm.faces.new([ring[i][k], ring[i][k2], ring[i + 1][k2], ring[i + 1][k]])
            f.material_index = mat
            if rope_uv:
                strands, lay = rope_uv
                for l, (ii, kk) in zip(f.loops, [(i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k)]):
                    l[uvl].uv = ((kk / sides) * strands / 9.0, lens[ii] / (circ * lay) * strands / 9.0)
    if caps == 'rings':  # a flat end with concentric rings of vertices (for colouring growth rings)
        for idx in (0, n - 1):
            cap_rings(bm, ring[idx], pts[idx], cap_rings_n, 0.0, mat if cap_mat is None else cap_mat)
    elif caps:
        for end, idx in ((0, 0), (1, n - 1)):
            c = bm.verts.new(pts[idx])
            for k in range(sides):
                k2 = (k + 1) % sides
                vs = [c, ring[idx][k2], ring[idx][k]] if end == 0 else [c, ring[idx][k], ring[idx][k2]]
                f = bm.faces.new(vs)
                f.material_index = mat
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bar(path, w, t, mat=0, bevel=None):
    """A flat strap of width w (across the plane normal to `up` = the direction of the first perpendicular) and thickness t swept
    along a polyline; used for handles. Returns a bmesh with flat ends."""
    return tube_rect(path, w, t, mat, bevel)


def tube_rect(path, w, t, mat=0, bevel=None, up=(0, 1, 0)):
    """A rectangular section (w along `up`, t across it) swept along a polyline; ends closed."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    upv = Vector(up).normalized()
    bm = lib.bm_new()
    rows = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        tg = (b - a).normalized()
        side = upv - tg * upv.dot(tg)
        side = side.normalized()
        nrm = tg.cross(side).normalized()
        row = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            row.append(bm.verts.new(pts[i] + side * (sx * w / 2) + nrm * (sy * t / 2)))
        rows.append(row)
    for i in range(n - 1):
        for k in range(4):
            k2 = (k + 1) % 4
            bm.faces.new([rows[i][k], rows[i][k2], rows[i + 1][k2], rows[i + 1][k]])
    bm.faces.new(rows[0][::-1])
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    lib.set_mat(bm, mat)
    if bevel:
        lib.bevel_bm(bm, bevel, 2, 25.0)
    return bm


def frame_xz(outer, inner, y0, y1, mat=0, bevel=None):
    """A flat frame (a loop with a hole) in the x-z plane extruded across y0..y1. outer/inner are closed (x, z) outlines."""
    bm = lib.bm_new()
    ov0 = [bm.verts.new((x, y0, z)) for x, z in outer]
    ov1 = [bm.verts.new((x, y1, z)) for x, z in outer]
    iv0 = [bm.verts.new((x, y0, z)) for x, z in inner]
    iv1 = [bm.verts.new((x, y1, z)) for x, z in inner]
    no, ni = len(outer), len(inner)
    for i in range(no):
        j = (i + 1) % no
        bm.faces.new([ov0[i], ov0[j], ov1[j], ov1[i]])
    for i in range(ni):
        j = (i + 1) % ni
        bm.faces.new([iv0[j], iv0[i], iv1[i], iv1[j]])
    # the front and back faces: bridge outer to inner with a triangle-free strip (both outlines share the same point count)
    if no == ni:
        for i in range(no):
            j = (i + 1) % no
            bm.faces.new([ov0[i], iv0[i], iv0[j], ov0[j]])
            bm.faces.new([ov1[j], iv1[j], iv1[i], ov1[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    lib.set_mat(bm, mat)
    if bevel:
        lib.bevel_bm(bm, bevel, 2, 30.0)
    return bm


def rounded_outline(cx, cz, w, h, r, n=8):
    """Closed rounded-rectangle outline (x, z), counter-clockwise, `n` points per corner."""
    pts = []
    for (sx, sz, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ccx = cx + sx * (w / 2 - r)
        ccz = cz + sz * (h / 2 - r)
        for k in range(n + 1):
            a = radians(a0 + 90.0 * k / n)
            pts.append((ccx + r * cos(a), ccz + r * sin(a)))
    return pts


def displace(bm, amp, scale, seed=1, octaves=3, only=None, stretch=(1, 1, 1), bias=0.0):
    """Move every vertex along its normal by fractal noise (amp mm, features about `scale` mm). `only(co, n)` -> weight 0..1."""
    bm.normal_update()
    off = Vector((seed * 17.3, seed * 5.1, seed * 9.7))
    for v in bm.verts:
        p = Vector((v.co.x * stretch[0], v.co.y * stretch[1], v.co.z * stretch[2])) / scale + off
        d = noise.fractal(p, 0.55, 2.0, octaves) + bias
        w = only(v.co, v.normal) if only else 1.0
        v.co += v.normal * (d * amp * w)
    return bm


def subdiv_to(bm, cell):
    """Split edges longer than `cell` mm (grid fill) until every edge is short enough, so noise has vertices to move."""
    for _ in range(6):
        long_edges = [e for e in bm.edges if e.calc_length() > cell * 1.3]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
    return bm


def bbox(bm):
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def fn_hash(*a):
    """A cheap deterministic pseudo-random number 0..1 from numbers."""
    x = sin(sum((i + 1) * 12.9898 * v for i, v in enumerate(a))) * 43758.5453
    return x - floor(x)


# --------------------------------------------------------------------------------------- objects, export, preview

def make_prop_obj(name, bm, mats, parent=None, sharp=38.0, weighted=True, smooth=True, uv=False):
    fill_unset_colours(bm)
    if not uv:  # texture coordinates only where the game puts a photographed set on the part
        for l in list(bm.loops.layers.uv):
            bm.loops.layers.uv.remove(l)
    lib.finish_mesh(bm, sharp, smooth)
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        v.co = v.co * MM
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        me.materials.append(m)
    if parent is not None:
        obj.parent = parent
    if weighted:
        mod = obj.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
        mod.mode = 'FACE_AREA'
        mod.weight = 50
        mod.thresh = 0.01
        mod.keep_sharp = True
    return obj


def world_bounds(objs):
    """Bounding box in metres (Blender axes) of evaluated meshes."""
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            p = o.matrix_world @ v.co
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
        ev.to_mesh_clear()
    return lo, hi


def bake_flat_colours(objs, skip=()):
    """The glTF exporter drops the colour constant of (vertex colour x colour), so fold each material's colour into the vertex colours.
    Materials named in `skip` (the ones the game replaces with a photographed set) keep pure multipliers."""
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        ca = me.color_attributes.get(COLN)
        if ca is None:
            continue
        vmat = {}
        for p in me.polygons:
            for vi in p.vertices:
                vmat.setdefault(vi, p.material_index)
        for vi, d in enumerate(ca.data):
            m = me.materials[vmat.get(vi, 0)]
            if m.name in skip:
                continue
            fc = m['flat_color']
            c = d.color
            d.color = (c[0] * fc[0], c[1] * fc[1], c[2] * fc[2], 1.0)
        # the material now reads the vertex colour directly
    for m in {mm for o in objs if o.type == 'MESH' for mm in o.data.materials}:
        if m.name in skip:
            continue
        nt = m.node_tree
        b = nt.nodes['Principled BSDF']
        for n in list(nt.nodes):
            if n.bl_idname == 'ShaderNodeMix':
                attr = [x for x in nt.nodes if x.bl_idname == 'ShaderNodeVertexColor']
                if attr:
                    nt.links.new(attr[0].outputs['Color'], b.inputs['Base Color'])
                nt.nodes.remove(n)


def export_glb(path, root):
    bpy.ops.object.select_all(action='DESELECT')
    stack = [root]
    while stack:
        o = stack.pop()
        o.select_set(True)
        stack.extend(o.children)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_extras=True, export_materials='EXPORT', export_image_format='AUTO', export_cameras=False,
        export_lights=False, export_animations=False, export_normals=True, export_tangents=False,
        export_texcoords=True, export_vertex_color='NAME', export_vertex_color_name=COLN, export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False, export_attributes=False)


def preview_floor(color):
    f = bpy.data.objects.get('preview_floor')
    if f:
        b = f.data.materials[0].node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*srgb(color), 1.0)


def frame_camera(lo, hi, az, el, fill=1.25, lens=70):
    """Camera position (mm) looking at the box centre from azimuth `az` (0 = straight in front, i.e. from -Y) and elevation `el`, degrees."""
    c = (Vector(lo) + Vector(hi)) / 2.0 / MM
    size = (Vector(hi) - Vector(lo)) / MM
    diag = size.length
    dist = diag * fill * (lens / 36.0) * 0.72 + 60
    a, e = radians(az), radians(el)
    d = Vector((sin(a) * cos(e), -cos(a) * cos(e), sin(e)))
    return tuple(c + d * dist), tuple(c)


# --------------------------------------------------------------------------------------- small maths and assembly

def lerp(a, b, t):
    return a + (b - a) * max(0.0, min(1.0, t))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def assemble(pid, parts, mats, extra=None, uv=(), origins=None, sharp=38.0):
    """parts: {node name: bmesh}; every part's material_index counts into `mats`. `origins` gives some nodes their own origin (mm, prop
    space), so the game can move them (the bridge posts). Returns the record the exporter and previews use."""
    root = lib.make_empty(pid, (0, 0, 0), display='PLAIN_AXES', size=0.01)
    objs = []
    for name, bm in parts.items():
        org = (origins or {}).get(name)
        if org:
            bmesh.ops.translate(bm, vec=-Vector(org), verts=bm.verts)
        o = make_prop_obj(name, bm, mats, root, sharp=sharp, weighted=name not in ('soft',), uv=name in uv)
        if org:
            o.location = Vector(org) * MM
        objs.append(o)
    lo, hi = world_bounds(objs)
    # glTF axes (x, up, depth): depth = -Blender y, so the front (-Y) is +z
    root['box'] = [round(lo.x, 5), round(lo.z, 5), round(-hi.y, 5), round(hi.x, 5), round(hi.z, 5), round(-lo.y, 5)]
    root['size'] = [round(hi.x - lo.x, 5), round(hi.z - lo.z, 5), round(hi.y - lo.y, 5)]
    for k, v in (extra or {}).items():
        root[k] = v
    return dict(root=root, nodes=[root] + objs, lo=lo, hi=hi)




def polar_solid(top_fn, bot_fn, nu, nv, mat=0):
    """A closed solid over a disc: u goes round (0..1, wraps), v from the middle (0) to the rim (1). top_fn / bot_fn(u, v) -> Vector."""
    bm = lib.bm_new()
    top = [[bm.verts.new(top_fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu)]
    bot = [[bm.verts.new(bot_fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu)]
    for i in range(nu):
        i2 = (i + 1) % nu
        for j in range(nv):
            bm.faces.new([top[i][j], top[i2][j], top[i2][j + 1], top[i][j + 1]])
            bm.faces.new([bot[i][j], bot[i][j + 1], bot[i2][j + 1], bot[i2][j]])
        bm.faces.new([top[i][nv], top[i2][nv], bot[i2][nv], bot[i][nv]])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    lib.set_mat(bm, mat)
    return bm


def sink_to_ground(bm, embed=0.5):
    """Move a finished part so its lowest point sits `embed` mm below z = 0 (and re-centre it in x, y on the base)."""
    lo, hi = bbox(bm)
    lib.translate(bm, -(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2] - embed)
    return bm


def toy_mat(name, hexv, rough=0.32, coat=0.55, coat_rough=0.08, sheen=0.25, sheen_rough=0.6):
    """A glossy toy plastic."""
    return make_mat(name, hexv, rough=rough, coat=coat, coat_rough=coat_rough, sheen=sheen, sheen_rough=sheen_rough)


def boolean(bm_a, bm_b, op='DIFFERENCE'):
    """Boolean (exact solver) of two closed parts; returns a new bmesh (the material indices survive)."""
    objs = []
    for bm in (bm_a, bm_b):
        me = bpy.data.meshes.new('tmp')
        bm.to_mesh(me)
        o = bpy.data.objects.new('tmp', me)
        bpy.context.scene.collection.objects.link(o)
        objs.append(o)
    mod = objs[0].modifiers.new('bool', 'BOOLEAN')
    mod.operation = op
    mod.solver = 'EXACT'
    mod.object = objs[1]
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(objs[0].evaluated_get(dg))
    out = bmesh.new()
    out.from_mesh(me)
    bpy.data.meshes.remove(me)
    for o in objs:
        m = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(m)
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    return out


def grid_box(sx, sy, sz, cell, center=(0, 0, 0), mat=0):
    """A box of welded quad grids with cells of about `cell` mm, so noise and booleans have vertices to work with."""
    nx, ny, nz = max(1, round(sx / cell)), max(1, round(sy / cell)), max(1, round(sz / cell))
    bm = lib.bm_new()
    hx, hy, hz = sx / 2, sy / 2, sz / 2

    def face(fn, n1, n2):
        g = grid(fn, n1, n2, mat=mat)
        merge(bm, g)
        g.free()
    face(lambda u, v: Vector((-hx + sx * u, -hy, -hz + sz * v)), nx, nz)
    face(lambda u, v: Vector((hx - sx * u, hy, -hz + sz * v)), nx, nz)
    face(lambda u, v: Vector((-hx, hy - sy * u, -hz + sz * v)), ny, nz)
    face(lambda u, v: Vector((hx, -hy + sy * u, -hz + sz * v)), ny, nz)
    face(lambda u, v: Vector((-hx + sx * u, -hy + sy * v, -hz)), nx, ny)
    face(lambda u, v: Vector((-hx + sx * u, hy - sy * v, hz)), nx, ny)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    translate_bm(bm, center)
    return bm


def translate_bm(bm, c):
    bmesh.ops.translate(bm, vec=Vector(c), verts=bm.verts)
    return bm


def cap_rings(bm, ring, center, rings=6, dish=0.0, mat=0):
    """Close an open boundary loop (list of verts, in order) with concentric rings shrinking to the centre, optionally dished by `dish` mm
    along the loop's own axis (the sawn end of a log gets its growth rings this way). Returns the new faces."""
    c = Vector(center)
    loops = [ring]
    axis = None
    pts = [v.co for v in ring]
    n = len(pts)
    axis = (pts[0] - c).cross(pts[n // 3] - c)
    axis = axis.normalized() if axis.length > 1e-9 else Vector((1, 0, 0))
    faces = []
    for k in range(1, rings):
        f = 1.0 - k / rings
        loops.append([bm.verts.new(c + (p - c) * f + axis * (dish * (1.0 - f) ** 2)) for p in pts])
    centre_v = bm.verts.new(c + axis * dish)
    for i, lp in enumerate(loops):
        nxt = loops[i + 1] if i + 1 < len(loops) else None
        for k in range(n):
            k2 = (k + 1) % n
            if nxt is not None:
                fc = bm.faces.new([lp[k], lp[k2], nxt[k2], nxt[k]])
            else:
                fc = bm.faces.new([lp[k], lp[k2], centre_v])
            fc.material_index = mat
            faces.append(fc)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return faces
