#!/usr/bin/env bash
# Rebuild the Moonbound sprite atlases: Blender (headless, Cycles on CPU) renders every frame, pack.py packs each set into
# 2048x2048 albedo pages and 1024x1024 normal pages, cwebp compresses. Outputs ../assets/sprites/<set>_<n>.webp,
# <set>_<n>_n.webp and <set>.json.
#   ./build.sh                          everything (wipes the frame cache first)
#   ONLY=thrall,gravebow ./build.sh     only those groups; every other frame is reused from the cache in $WORK/frames
#   FRAME=thrall_attack_d2_5 ONLY=thrall  only those frames of those groups (FRAME needs ONLY)
#   REVIEW=/some/dir ./build.sh         also write a contact sheet of the frames this run rendered there
#   NOPACK=1                            render (and review) only, leave the atlases alone
#   PACKONLY=1                          skip rendering: pack the frames already in the cache
#   SETS=hollow,common                  pack only those sets (default: every set in the cache)
#   QUALITY=fast|high                   fewer or more Cycles samples
#   ATLAS_OUT=dir CODEX_OUT=dir         write the atlases and portraits there instead of ../assets (measuring a set)
#   ALLOW_SHRINK=1                      let a set lose frames its shipped json has (frames removed on purpose)
# Needs Blender 5.2 (BLENDER=... to override) and cwebp. Intermediate files live in $WORK (default under $TMPDIR), never in the repo.
# Every set is packed and compressed into $WORK/stage first; the shipped files are replaced only once all of them succeed.
set -eo pipefail
export PYTHONDONTWRITEBYTECODE=1 # no __pycache__ beside the scripts (pack.py, review.py)
cd "$(dirname "$0")"
HERE="$(pwd)"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
CWEBP="${CWEBP:-$(command -v cwebp || echo /opt/homebrew/bin/cwebp)}"
WORK="${WORK:-${TMPDIR:-/tmp}/moonbound-build}"
OUT="${ATLAS_OUT:-$HERE/../assets/sprites}"   # ATLAS_OUT=dir packs elsewhere (to measure a set without touching the game)
THREADS="${THREADS:-4}"
die() { echo "build.sh: $*" >&2; exit 1; }
command -v "$BLENDER" >/dev/null 2>&1 || die "cannot run Blender at $BLENDER (set BLENDER=...)"
if [ -z "$NOPACK" ]; then command -v "$CWEBP" >/dev/null 2>&1 || die "cannot run cwebp at $CWEBP (set CWEBP=...)"; fi
if [ -n "$FRAME" ] && [ -z "$ONLY" ]; then die "FRAME needs ONLY (without ONLY the frame cache is wiped first)"; fi
export MB_TMP="$WORK/scratch"
STAGE="$WORK/stage"
mkdir -p "$WORK/frames" "$WORK/atlas" "$MB_TMP" "$OUT"
START=$(date +%s)
QUIET="^Ignoring\|Saved:\|use_nodes\|DeprecationWarning\|^Fra:\|^Blender\|^Read\|^$\|Time:\|^Color management"

# At most two heavy jobs at once on this machine (Blender builds, plus browser benches): a job holds one of two lock slots
# (mkdir is atomic, so jobs starting together cannot both slip in), and also waits while the machine is busy or short of memory.
HEAVY="${TMPDIR:-/tmp}/moonbound-heavy"
mkdir -p "$HEAVY"
SLOT=""
while [ -z "$SLOT" ]; do
  for s in 0 1; do
    d="$HEAVY/slot$s"
    if mkdir "$d" 2>/dev/null; then echo $$ > "$d/pid"; SLOT="$d"; break; fi
    p=$(cat "$d/pid" 2>/dev/null || true)
    # a slot whose job has gone (or that never got its pid written) is freed
    if { [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null; } || { [ -z "$p" ] && [ -n "$(find "$d" -maxdepth 0 -mmin +1 2>/dev/null)" ]; }; then rm -rf "$d"; fi
  done
  [ -z "$SLOT" ] && { echo "waiting: two heavy jobs going"; sleep 10; }
done
trap 'rm -rf "$SLOT"' EXIT
while : ; do
  LOAD=$(uptime | sed 's/.*load averages*: *//' | awk '{gsub(",","",$1); print int($1)}')
  FREE=$(memory_pressure 2>/dev/null | tail -1 | sed 's/[^0-9]*\([0-9]*\)%.*/\1/' || true)
  [ -z "$FREE" ] && FREE=100
  if [ "$LOAD" -le 20 ] && [ "$FREE" -ge 20 ]; then break; fi
  echo "waiting: load $LOAD, free memory $FREE%"; sleep 20
done

if [ -z "$PACKONLY" ]; then
  if [ -z "$ONLY" ]; then rm -rf "${WORK:?}/frames"; mkdir -p "$WORK/frames"; fi
  "$BLENDER" -b --factory-startup --python-exit-code 1 -t "$THREADS" -P render.py -- --out "$WORK/frames" ${ONLY:+--only "$ONLY"} ${FRAME:+--frame "$FRAME"} --threads "$THREADS" ${QUALITY:+--quality "$QUALITY"} 2>&1 | { grep -v "$QUIET" || true; }
  RENDERED=1
fi
if [ -n "$REVIEW" ]; then
  # one sheet per run, named after the groups, of the frames this run rendered (with PACKONLY, of the whole cache);
  # REVIEW_MATCH=thrall_walk,thrall_idle limits it to frames with those prefixes
  mkdir -p "$REVIEW"
  TAG=$(echo "${ONLY:-all}" | tr ',' '-')
  "$BLENDER" -b --factory-startup --python-exit-code 1 -P review.py -- --frames "$WORK/frames" --out "$REVIEW/review-$TAG.png" ${REVIEW_MATCH:+--match "$REVIEW_MATCH"} ${RENDERED:+--since "$START"} 2>&1 | { grep -v "$QUIET" || true; }
fi
[ -n "$NOPACK" ] && exit 0
rm -rf "$STAGE"
mkdir -p "$STAGE/codex" "$STAGE/sprites"
# codex portraits: lit PNGs -> WebP
for f in "$WORK"/frames/portraits/*.png; do
  [ -e "$f" ] || continue
  "$CWEBP" -quiet -q 86 -alpha_q 90 -m 6 "$f" -o "$STAGE/codex/$(basename "$f" .png).webp"
done
PACKED=""
for d in "$WORK"/frames/*/; do
  set_name=$(basename "$d")
  [ "$set_name" = portraits ] && continue
  if [ -n "$SETS" ] && ! echo ",$SETS," | grep -q ",$set_name,"; then continue; fi
  rm -f "$WORK"/atlas/"$set_name"_*.png # pages left from a bigger pack would be shipped too
  "$BLENDER" -b --factory-startup --python-exit-code 1 -P pack.py -- --frames "$d" --out "$WORK/atlas" --json "$STAGE/sprites/$set_name.json" --set "$set_name" --old "$OUT/$set_name.json" ${ALLOW_SHRINK:+--allow-shrink} 2>&1 | { grep -v "$QUIET" || true; }
  for f in "$WORK"/atlas/"$set_name"_*.png; do
    b=$(basename "$f" .png)
    case "$b" in
      *_n) "$CWEBP" -quiet -q 90 -alpha_q 90 -m 6 -exact "$f" -o "$STAGE/sprites/$b.webp" ;;
      *) "$CWEBP" -quiet -q 80 -alpha_q 90 -m 6 -exact "$f" -o "$STAGE/sprites/$b.webp" ;; # no visible loss against q 86 + lossless alpha, half the size
    esac
  done
  PACKED="$PACKED $set_name"
done
# everything packed: replace the shipped files
if [ -n "$(ls "$STAGE/codex")" ]; then
  CODEX="${CODEX_OUT:-$HERE/../assets/codex}"
  mkdir -p "$CODEX"
  mv -f "$STAGE"/codex/*.webp "$CODEX/"
fi
for set_name in $PACKED; do
  rm -f "$OUT"/"$set_name"_*.webp
  mv -f "$STAGE"/sprites/"$set_name"_*.webp "$STAGE/sprites/$set_name.json" "$OUT/"
done
echo "atlases $(du -ck "$OUT"/*.webp 2>/dev/null | tail -1 | cut -f1) KB, built in $(( $(date +%s) - START )) s"
