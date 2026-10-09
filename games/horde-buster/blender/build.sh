#!/bin/sh
# Rebuild the Horde Buster sprite atlas: Blender (headless, Cycles on CPU) renders every frame, pack.py packs them into
# 2048x2048 pages, cwebp compresses. Outputs ../assets/sprites/sprites_<n>.webp, sprites_<n>_n.webp and sprites.json.
#   ./build.sh                          everything (wipes the frame cache first)
#   ONLY=zombies,brute ./build.sh       only those groups; every other frame is reused from the cache in $WORK/frames
#   FRAME=shambler_walk_0 ONLY=zombies  only those frames of those groups
#   REVIEW=/some/dir ./build.sh         also write a contact sheet per rendered group there
#   NOPACK=1                            render (and review) only, leave the atlas alone
#   PACKONLY=1                          skip rendering: pack the frames already in the cache
# Needs Blender 5.2 (BLENDER=... to override) and cwebp. Intermediate files live in $WORK (default under $TMPDIR), never in the repo.
set -e
export PYTHONDONTWRITEBYTECODE=1 # no __pycache__ beside the scripts (pack.py, review.py)
cd "$(dirname "$0")"
HERE="$(pwd)"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
CWEBP="${CWEBP:-$(command -v cwebp || echo /opt/homebrew/bin/cwebp)}"
WORK="${WORK:-${TMPDIR:-/tmp}/horde-buster-build}"
OUT="$HERE/../assets/sprites"
THREADS="${THREADS:-4}"
export HB_TMP="$WORK/scratch"
mkdir -p "$WORK/frames" "$WORK/atlas" "$HB_TMP" "$OUT"
START=$(date +%s)
QUIET="^Ignoring\|Saved:\|use_nodes\|DeprecationWarning\|^Fra:\|^Blender\|^Read\|^$\|Time:"

# wait until the machine is calm enough for a render, and while two other Blender renders are already running
while : ; do
  BUSY=$(pgrep -f "MacOS/Blender -b" | wc -l | tr -d ' ')
  if [ "$BUSY" -ge 2 ]; then echo "waiting: $BUSY Blender runs going"; sleep 10; continue; fi
  LOAD=$(uptime | sed 's/.*load averages*: *//' | awk '{gsub(",","",$1); print int($1)}')
  FREE=$(memory_pressure 2>/dev/null | tail -1 | sed 's/[^0-9]*\([0-9]*\)%.*/\1/')
  [ -z "$FREE" ] && FREE=100
  if [ "$LOAD" -le 20 ] && [ "$FREE" -ge 20 ]; then break; fi
  echo "waiting: load $LOAD, free memory $FREE%"; sleep 20
done

if [ -z "$PACKONLY" ]; then
if [ -z "$ONLY" ]; then rm -rf "${WORK:?}/frames"; mkdir -p "$WORK/frames"; fi
"$BLENDER" -b --factory-startup -t "$THREADS" -P render.py -- --out "$WORK/frames" ${ONLY:+--only "$ONLY"} ${FRAME:+--frame "$FRAME"} --threads "$THREADS" ${QUALITY:+--quality "$QUALITY"} 2>&1 | grep -v "$QUIET" || true
fi
if [ -n "$REVIEW" ]; then
  # one sheet named after the groups; REVIEW_MATCH=shambler,runner limits it to frames with those name prefixes
  mkdir -p "$REVIEW"
  TAG=$(echo "${ONLY:-all}" | tr ',' '-')
  "$BLENDER" -b --factory-startup -P review.py -- --frames "$WORK/frames" --out "$REVIEW/review-$TAG.png" ${REVIEW_MATCH:+--match "$REVIEW_MATCH"} 2>&1 | grep "review:" || true
fi
[ -n "$NOPACK" ] && exit 0
"$BLENDER" -b --factory-startup -P pack.py -- --frames "$WORK/frames" --out "$WORK/atlas" --json "$OUT/sprites.json" 2>&1 | grep -v "$QUIET"
rm -f "$OUT"/sprites_*.webp
for f in "$WORK"/atlas/sprites_*.png; do
  b=$(basename "$f" .png)
  case "$b" in
    *_n) "$CWEBP" -quiet -q 92 -alpha_q 90 -m 6 -exact "$f" -o "$OUT/$b.webp" ;;
    *) "$CWEBP" -quiet -q 88 -alpha_q 100 -m 6 -exact "$f" -o "$OUT/$b.webp" ;;
  esac
done
echo "atlas $(du -ck "$OUT"/sprites_*.webp | tail -1 | cut -f1) KB, built in $(( $(date +%s) - START )) s"
