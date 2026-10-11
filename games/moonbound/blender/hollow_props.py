"""The Hollow's props (set hollow, 64 px/m, one frame each, seen from the game camera): the Moonwell Cauldron, the Elder Yew's
roots, cave rocks, the Gate of Roots, the weapon racks, furniture, candles and glowing fungi.

Every piece is built around its footprint centre (front = -Y); the pivot is the ground point under that centre. Recorded for
the game: values.footprint[name] = [width x, depth y] and, for lit pieces, anchors.light[name] (the main light point, [x east,
y south, z up]) plus values.lights[name] (every light point).
"""
import hollow_geo as G
import hollow_mat

SET = 'hollow'
PPM = 64

# name -> (module, function); modules are imported lazily so a FRAME= rebuild only loads what it needs
REGISTRY = []


def _reg(mod, names):
    for n in names:
        REGISTRY.append((n, mod, n[3:]))


REGISTRY.append(('ho_cauldron', 'hollow_cauldron', 'cauldron'))
_reg('hollow_small', ['ho_candles_a', 'ho_candles_b', 'ho_candles_c', 'ho_lantern_post', 'ho_basket_a', 'ho_basket_b', 'ho_barrel', 'ho_crate',
                      'ho_chest', 'ho_mushrooms_a', 'ho_mushrooms_b'])
_reg('hollow_rack', ['ho_weapon_rack_both', 'ho_weapon_rack_twins', 'ho_weapon_rack_staff'])
_reg('hollow_furn', ['ho_lectern', 'ho_bookshelf', 'ho_shelf_potions', 'ho_table', 'ho_bed', 'ho_armchair', 'ho_rug', 'ho_hearth'])
_reg('hollow_gate', ['ho_gate_closed', 'ho_gate_open'])
_reg('hollow_roots', ['ho_root_a', 'ho_root_b', 'ho_root_c', 'ho_root_d', 'ho_root_e', 'ho_root_f', 'ho_root_arch',
                      'ho_rock_a', 'ho_rock_b', 'ho_rock_c', 'ho_rock_d'])


def center_xy(m):
    """Recentre a Mesh on the middle of its ground footprint; returns (width, depth)."""
    xs = [v.co.x for v in m.bm.verts]
    ys = [v.co.y for v in m.bm.verts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    m.transform(G.trans(-cx, -cy, 0))
    return max(xs) - min(xs), max(ys) - min(ys), cx, cy


def build(ctx):
    import importlib
    hollow_mat.install()
    for name, modname, fname in REGISTRY:
        if not ctx.want(name):
            continue
        mod = importlib.import_module(modname)
        res = getattr(mod, fname)()
        lights, fixed = None, None
        if isinstance(res, tuple):
            m, lights = res[0], res[1]
            fixed = res[2] if len(res) > 2 else None
        else:
            m = res
        if fixed:     # a piece that keeps its own origin (the two gates must share a pivot)
            w, d = fixed
            cx = cy = 0.0
        else:
            w, d, cx, cy = center_xy(m)
        if lights is not None:
            lights.pts = [(x - cx, y - cy, z) for x, y, z in lights.pts]
            lights.record(ctx, name)
        ctx.value('footprint', name, [round(w, 2), round(d, 2)])
        ctx.one(name, m, ppm=PPM)
