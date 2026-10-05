#!/bin/sh
# Rebuild the Iron Barrage sprite atlases: Blender (headless, Cycles on CPU) renders every frame, pack.py packs them,
# cwebp compresses. Outputs ../assets/sprites/units.webp, units_n.webp and units.json.
#   ./build.sh                       everything
#   ONLY=warden,crew ./build.sh      only some groups (the rest are reused from the last run in $WORK)
#   INTERIM=1 ./build.sh             alias missing bulwark/lynx frames to the warden ones
#   REVIEW=/some/dir ./build.sh      also write contact sheets and assembled tanks there
# Needs Blender 5.2 (BLENDER=... to override) and cwebp. Intermediate files live in $WORK (default under $TMPDIR), never in the repo.
set -e
cd "$(dirname "$0")"
HERE="$(pwd)"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
CWEBP="${CWEBP:-$(command -v cwebp || echo /opt/homebrew/bin/cwebp)}"
WORK="${WORK:-${TMPDIR:-/tmp}/iron-barrage-build}"
OUT="$HERE/../assets/sprites"
THREADS="${THREADS:-8}"
export IB_TMP="$WORK/scratch"
mkdir -p "$WORK/frames" "$WORK/atlas" "$IB_TMP" "$OUT"
START=$(date +%s)

# wait until the machine is calm enough for a render
while : ; do
  LOAD=$(uptime | sed 's/.*load averages*: *//' | awk '{gsub(",","",$1); print int($1)}')
  FREE=$(memory_pressure 2>/dev/null | tail -1 | sed 's/[^0-9]*\([0-9]*\)%.*/\1/')
  [ -z "$FREE" ] && FREE=100
  if [ "$LOAD" -le 20 ] && [ "$FREE" -ge 20 ]; then break; fi
  echo "waiting: load $LOAD, free memory $FREE%"; sleep 20
done

if [ -z "$ONLY" ]; then rm -rf "${WORK:?}/frames"; mkdir -p "$WORK/frames"; fi
"$BLENDER" -b --factory-startup -t "$THREADS" -P render.py -- --out "$WORK/frames" ${ONLY:+--only "$ONLY"} --threads "$THREADS" ${QUALITY:+--quality "$QUALITY"} 2>&1 | grep -v "^Ignoring\|Saved:\|use_nodes\|DeprecationWarning" || true
"$BLENDER" -b --factory-startup -P pack.py -- --frames "$WORK/frames" --out "$WORK/atlas" --json "$OUT/units.json" ${INTERIM:+--interim} 2>&1 | grep -v "^Ignoring\|use_nodes\|DeprecationWarning"
"$CWEBP" -quiet -q 88 -alpha_q 100 -m 6 -exact "$WORK/atlas/units.png" -o "$OUT/units.webp"
"$CWEBP" -quiet -q 92 -alpha_q 90 -m 6 -exact "$WORK/atlas/units_n.png" -o "$OUT/units_n.webp"
if [ -n "$REVIEW" ]; then
  mkdir -p "$REVIEW"
  "$BLENDER" -b --factory-startup -P review.py -- --sprites "$OUT" --out "$REVIEW" --work "$WORK" 2>&1 | grep -v "^Ignoring\|use_nodes\|DeprecationWarning"
fi
echo "units.webp $(( $(wc -c < "$OUT/units.webp") / 1024 )) KB, units_n.webp $(( $(wc -c < "$OUT/units_n.webp") / 1024 )) KB, built in $(( $(date +%s) - START )) s"
