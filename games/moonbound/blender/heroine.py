"""Maelis, the last Moonbound: sprites for both weapons (sets hero_twins and hero_staff, 16 directions mirrored, 80 px/m) and her
two codex portraits. See heroine_rig.py (body and IK), heroine_model.py (meshes), heroine_sim.py (baked hair, coat, sleeves, hat),
heroine_anim.py (the animations), heroine_mats.py (materials and embroidery).

Debug switches (environment): HR_WP=twins|staff, HR_ANIM=idle,run,... (or `portrait`), HR_DIRS=4,0,12, HR_IDX=0,3,6.
"""
import math
import os
import re
import time

import numpy as np
from mathutils import Matrix, Vector

import bl
import heroine_anim as HA
import heroine_mats
import heroine_model as HM
import heroine_sim as HS
from bl import facing
from heroine_rig import Cache, weapon_frame

SET = 'hero_twins'
PPM = 80
DIRS = 16
SUB = 240.0
FLUSH_AREA = 1.6 * (bl.SHEET_MAX // bl.SS) ** 2     # as in render.py


def _env(k):
    v = os.environ.get(k)
    return [x for x in v.split(',') if x] if v else None


def _tq(i, fps):
    return math.ceil(i / fps * SUB - 1e-6) / SUB


class Baked:
    """The hair, cloth and hat of one animation, baked once when the first frame is asked for."""

    def __init__(self, wp, name, spec):
        self.wp, self.name, self.spec = wp, name, spec
        self.tq = [_tq(i, spec.fps) for i in range(spec.n)]
        self.cache = Cache(spec.pose, wp)
        self.done = False

    def bake(self):
        if self.done:
            return
        t0 = time.time()
        spec, wp = self.spec, self.wp
        period = spec.n / spec.fps if spec.loop else None
        S0 = self.cache.at(self.tq[0])
        self.hair_sim, self.chains = HS.build_hair(LOCKS)
        self.gar_sim, self.lay = HS.build_garment(wp)
        for sim, pre in ((self.hair_sim, 'hair_'), (self.gar_sim, 'gar_')):
            for k, attr in (('drag', 'drag'), ('damp', 'damping')):
                if pre + k in spec.cloth:
                    setattr(sim.cl, attr, spec.cloth[pre + k])
        loops = spec.loops
        hair_air = (lambda t, f=spec.air, k=spec.hair_air: tuple(k * v for v in f(t))) if spec.air else None
        self.hairX = HS.bake(self.hair_sim, S0, self.cache, HS.hair_cols, self.tq, period, hair_air, loops, spec.settle)
        self.garX = HS.bake(self.gar_sim, S0, self.cache, lambda S: HS.garment_cols(S, wp), self.tq, period, spec.air, loops, spec.settle)
        air = np.array(spec.air(0.0))
        self.hat = HS.hat_dyn(self.cache, self.tq, period, air, loops, spec.settle)
        self.done = True
        seam = ''
        if period:
            ratios = []
            for X in (self.hairX, self.garX):
                A = np.array(X)
                d = [np.linalg.norm(A[(i + 1) % len(A)] - A[i], axis=1).mean() for i in range(len(A))]
                ratios.append(d[-1] / max(float(np.median(d[:-1])), 1e-6))
            seam = '  seam hair %.2f cloth %.2f (1 = closed)' % tuple(ratios)
        print('  baked %s_%s in %.1f s%s' % (wp, self.name, time.time() - t0, seam), flush=True)

    def meshes(self, i):
        self.bake()
        S = self.cache.at(self.tq[i])
        tip, droop = self.hat[i]
        hat, _, _ = HM.hat_mesh(S, tip, droop)
        return [HM.body_mesh(S), hat, HM.hair_mesh(self.hairX[i], self.chains, LOCKS),
                HM.garment_mesh(S, self.garX[i], self.lay, self.wp), HM.weapons_mesh(S, self.garX[i], self.lay, self.wp)], S


LOCKS = HS.hair_layout()


def record_anchors(ctx, wp, prefix, i, S, set_name):
    nm = '%s_%d' % (prefix, i)
    ctx.anchor('hand_l', nm, S.fist_l, set=set_name)
    ctx.anchor('hand_r', nm, S.fist_r, set=set_name)
    if wp == 'staff':
        WF = weapon_frame(S, 'r')
        ctx.anchor('staff_head', nm, WF @ Vector(HS.STAFF_O), set=set_name)
        ctx.anchor('staff_butt', nm, WF @ Vector((0, 0, -0.85)), set=set_name)
    else:
        for s in ('l', 'r'):
            WF = weapon_frame(S, s)
            ctx.anchor('blade_mid_' + s, nm, WF @ Vector((0, 0.1095, 0.314)), set=set_name)
            ctx.anchor('blade_tip_' + s, nm, WF @ Vector((0, 0.3238, 0.305)), set=set_name)


def build(ctx):
    heroine_mats.images()
    only_wp = _env('HR_WP') or ['twins', 'staff']
    only_anim = _env('HR_ANIM')
    only_dirs = _env('HR_DIRS')
    only_idx = _env('HR_IDX')
    dset = None if not only_dirs else set(int(x) for x in only_dirs)
    iset = None if not only_idx else set(int(x) for x in only_idx)
    orig_want = ctx.want

    def want(name):
        if not orig_want(name):
            return False
        m = re.search(r'_d(\d+)_(\d+)$', name)
        if m:
            if dset is not None and int(m.group(1)) not in dset:
                return False
            if iset is not None and int(m.group(2)) not in iset:
                return False
        return True
    ctx.want = want
    for wp in only_wp:
        set_name = 'hero_' + wp
        for name, spec in HA.anims(wp).items():
            if only_anim and name not in only_anim:
                continue
            prefix = 'hero_%s_%s' % (wp, name)
            bk = Baked(wp, name, spec)
            if spec.hit:
                ctx.value('hit', prefix, list(spec.hit), set=set_name)
            if spec.release:
                ctx.value('release', prefix, list(spec.release), set=set_name)

            def fn(i, bk=bk, wp=wp, prefix=prefix, set_name=set_name):
                # render.Ctx.anim flushes (and frees the frame's meshes) whenever enough frames are queued, which would
                # strand the remaining directions of a frame; flush between frames instead, before this frame's meshes exist
                pend = sum(c.w * c.h for items in ctx.pending.values() for c, _ in items)
                if pend > 0.32 * FLUSH_AREA:
                    ctx.flush()
                ms, S = bk.meshes(i)
                record_anchors(ctx, wp, prefix, i, S, set_name)
                return ms
            ctx.anim(prefix, spec.n, fn, dirs=DIRS, mirror=True, ppm=PPM, set=set_name, fps=spec.fps, loop=spec.loop)
    if not only_anim or 'portrait' in only_anim:
        portraits(ctx, only_wp)


def portrait_pose(wp):
    from heroine_anim import idle0
    from heroine_rig import hand
    p = idle0(wp)
    if wp == 'twins':
        p.update(hand('l', (0.22, 0.30, 1.02), (-0.12, 0.2, 1.0), (-0.3, 1.0, 0.1), (0.8, 0.4, 0.5)))
        p.update(hand('r', (-0.31, 0.12, 0.80), (-0.3, 0.3, -0.9), (0.3, 1.0, 0.15), (0.8, 0.3, 0.7)))
    else:
        p.update(hand('l', (0.2, 0.05, 0.98), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), (0.9, 0.3, 0.9)))
    p.update(head_pitch=-0.16, head_yaw=0.14, head_roll=0.06, hat_p=-0.17, lean=0.0, twist=-0.12, roll=0.05)
    return p


def portraits(ctx, only_wp):
    from heroine_anim import Spec
    for wp, pid in (('twins', 'maelis'), ('staff', 'maelis_staff')):
        if wp not in only_wp:
            continue
        if not ctx.want(pid):
            continue
        pose = portrait_pose(wp)
        bk = Baked(wp, 'portrait', Spec(1, 10, False, lambda t, pose=pose: pose, settle=1.2))
        ms, S = bk.meshes(0)
        R = facing(math.radians(110))
        for m in ms:
            m.transform(R)
        ctx.portrait(pid, ms, ppm=240, elev=20.0)
