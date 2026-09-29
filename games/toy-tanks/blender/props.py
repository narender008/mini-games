"""Build the Toy Tanks stage props in Blender and export them as GLB.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python props.py -- \
      --only mushroom,bucket --raw /tmp/prop-raw --preview /tmp/prop-previews --views ref,front

(build_props.sh does the whole job, including the gltfpack compression.)

Toy-scale props for the five stages, photoreal-toy look: glossy plastics, wet sand, weathered wood, rope, moss, pearly shells.
Everything is modelled in millimetres, origin at the middle of the base, front = -Y (the glTF +Z, towards the camera).
Materials that the game swaps for its photographed sets (assets/tex) are named after the set: sand-wet, wood, rope, bark, moss, soil.
Their texture coordinates are in texture tiles (repeat 1). Vertex colours multiply the material colour (weathering, wetness, paint).
"""
import os
import sys
import math
from math import pi, sin, cos, atan2, sqrt, exp, radians

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy
import bmesh
from mathutils import Vector, Matrix
import lib
import plib
from plib import add, srgb, mixc, scale_c, paint, fn_hash

# which materials the game replaces with a photographed PBR set, for the preview pictures (same names as assets/tex/<name>-*.webp)
PBR_MATS = list(plib.PBR_NAMES)
PREVIEW_FLOOR = {'beach': 0xb98a55, 'garden': 0x4a3a28, 'forest': 0x4e6a2c}
STAGE_OF = {'sandcastle': 'beach', 'bucket': 'beach', 'spade': 'beach', 'shell-scallop': 'beach', 'shell-spiral': 'beach', 'shell-cockle': 'beach',
            'starfish': 'beach', 'watering-can': 'garden', 'fence': 'garden', 'flowerpot': 'garden', 'rope-bridge': 'forest', 'log': 'forest',
            'mushroom': 'forest'}


BUILDERS = {}
for _mod in ('props_beach', 'props_garden', 'props_forest'):  # one file per stage, so each stays readable
    try:
        BUILDERS.update(__import__(_mod).BUILDERS)
    except ImportError as _e:
        print('props: skipping', _mod, _e)


# ============================================================================================ main

VIEWS = {'ref': (-28, 16), 'front': (0, 8), 'top': (0, 72), 'side': (-75, 12), 'back': (150, 20), 'low': (-20, 4)}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = {'only': ','.join(BUILDERS), 'raw': None, 'preview': None, 'views': 'ref', 'samples': '48', 'res': '900x640', 'plain': '0', 'lens': '70', 'exposure': '-1.6'}
    i = 0
    while i < len(argv):
        if argv[i].startswith('--'):
            opts[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    for name in opts['only'].split(','):
        if opts['raw']:
            lib.reset_scene()
            res = BUILDERS[name]()
            root = res['root']
            tris = lib.count_tris(res['nodes'])
            print(f'PROP {name}: {len(res["nodes"]) - 1} meshes, {tris} triangles, size(x,y,z)={list(root["size"])} box={list(root["box"])}')
            plib.bake_flat_colours(res['nodes'], skip=PBR_MATS)  # the export folds the material colours into the vertex colours
            os.makedirs(opts['raw'], exist_ok=True)
            plib.export_glb(os.path.join(opts['raw'], f'prop-{name}.glb'), root)
        if opts['preview']:
            lib.reset_scene()
            res = BUILDERS[name]()
            if not opts['raw']:
                print(f'PROP {name}: {lib.count_tris(res["nodes"])} triangles, size(x,y,z)={list(res["root"]["size"])}')
            os.makedirs(opts['preview'], exist_ok=True)
            w, h = [int(v) for v in opts['res'].split('x')]
            lib.setup_preview((w, h), int(opts['samples']))
            bpy.context.scene.view_settings.exposure = float(opts['exposure'])
            plib.preview_floor(PREVIEW_FLOOR[STAGE_OF[name]])
            if opts['plain'] == '0':
                for m in bpy.data.materials:
                    if m.name in PBR_MATS:
                        plib.textured_preview(m, m.name)
            lens = float(opts['lens'])
            for v in opts['views'].split(','):
                az, el = VIEWS[v]
                pos, tgt = plib.frame_camera(res['lo'], res['hi'], az, el, lens=lens)
                lib.render_view(os.path.join(opts['preview'], f'{name}-{v}.png'), pos, tgt, lens=lens)


if __name__ == '__main__':
    main()
