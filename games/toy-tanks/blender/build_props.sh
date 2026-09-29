#!/bin/sh
# Rebuild the stage props: Blender (headless) -> raw GLB -> gltfpack (meshopt compression) -> ../assets/models/prop-<id>.glb
#   ./build_props.sh                     all of them
#   ./build_props.sh bucket,sandcastle   some of them
# Needs Blender 5.2 (BLENDER=... to override the path) and node/npx for gltfpack. Nothing is kept in the repo except the GLBs.
set -e
cd "$(dirname "$0")"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
RAW="${RAW:-${TMPDIR:-/tmp}/toy-tanks-props-raw}"
OUT="../assets/models"
ALL="sandcastle,bucket,spade,shell-scallop,shell-spiral,shell-cockle,starfish,watering-can,fence,flowerpot,rope-bridge,log,mushroom"
ONLY="${1:-$ALL}"
mkdir -p "$RAW" "$OUT"
"$BLENDER" -b --factory-startup --python props.py -- --only "$ONLY" --raw "$RAW"
for id in $(echo "$ONLY" | tr ',' ' '); do
  # -cc: meshopt compression; -kn/-km/-ke keep node names, material names and extras; -kv keeps the texture coordinates and colours
  # (the game puts photographed sets on some materials at load time); -vp/-vn/-vt: quantisation bits for positions, normals, UVs
  # the rough matte ones (sand, wood, bark, moss) do with coarser normals than the glossy plastics
  case "$id" in sandcastle|log|fence|rope-bridge) Q="-vp 12 -vn 8 -vt 10" ;; *) Q="-vp 13 -vn 12 -vt 10" ;; esac
  npx -y gltfpack@1.3.0 -i "$RAW/prop-$id.glb" -o "$OUT/prop-$id.glb" -cc -kn -km -ke -kv $Q
  echo "$OUT/prop-$id.glb: $(wc -c < "$OUT/prop-$id.glb") bytes"
done
