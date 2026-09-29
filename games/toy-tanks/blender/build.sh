#!/bin/sh
# Rebuild the tank models: Blender (headless) -> raw GLB -> gltfpack (meshopt compression) -> ../assets/models/tank-<id>.glb
#   ./build.sh                 all six
#   ./build.sh classic,chunky  some of them
# Needs Blender 5.2 (BLENDER=... to override the path) and node/npx for gltfpack. Nothing is kept in the repo except the GLBs.
set -e
cd "$(dirname "$0")"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
RAW="${RAW:-${TMPDIR:-/tmp}/toy-tanks-raw}"
OUT="../assets/models"
ONLY="${1:-classic,chunky,mini,long,twin,dome}"
mkdir -p "$RAW" "$OUT"
"$BLENDER" -b --factory-startup --python tanks.py -- --only "$ONLY" --raw "$RAW"
for id in $(echo "$ONLY" | tr ',' ' '); do
  # -cc: meshopt compression (EXT_meshopt_compression); -kn/-km/-ke keep the node names, material names and extras the game reads;
  # -vp 16 / -vn 12: finer positions and normals than the defaults so the glossy paint reflects smoothly
  npx -y gltfpack@1.3.0 -i "$RAW/tank-$id.glb" -o "$OUT/tank-$id.glb" -cc -kn -km -ke -vp 16 -vn 12
  echo "$OUT/tank-$id.glb: $(wc -c < "$OUT/tank-$id.glb") bytes"
done
