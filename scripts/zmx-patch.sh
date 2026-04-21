#!/usr/bin/env sh
set -eu

ROOT="${SUPATERM_ROOT_OVERRIDE:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
SUBMODULE_PATH="${SUPATERM_ZMX_SUBMODULE_PATH:-$ROOT/third_party/zmx}"
PATCH_DIR="${SUPATERM_ZMX_PATCH_DIR:-$ROOT/patches/zmx}"
PATCH_FILE="${SUPATERM_ZMX_PATCH_FILE:-$PATCH_DIR/zmx.patch}"
STATE_FILE="${SUPATERM_ZMX_STATE_FILE:-$PATCH_DIR/state.json}"
REMOTE="${SUPATERM_ZMX_REMOTE:-origin}"
REF="${SUPATERM_ZMX_REF:-main}"

usage() {
  cat <<'EOF'
Usage:
  sh ./scripts/zmx-patch.sh patch [--patch-file path]
  sh ./scripts/zmx-patch.sh apply [--patch-file path]
  sh ./scripts/zmx-patch.sh sync [--remote origin] [--ref main] [--patch-file path]

This workflow uses plain git patch/apply semantics.
EOF
}

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$ROOT" "$1" ;;
  esac
}

write_state() {
  mkdir -p "$(dirname "$STATE_FILE")"
  upstream_commit=$(git -C "$SUBMODULE_PATH" rev-parse HEAD)
  updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  patch_path_for_state="$PATCH_FILE"
  case "$PATCH_FILE" in
    "$ROOT"/*) patch_path_for_state=${PATCH_FILE#"$ROOT"/} ;;
  esac
  cat >"$STATE_FILE" <<EOF
{
  "upstreamRef": "$1",
  "upstreamCommit": "$upstream_commit",
  "updatedAt": "$updated_at",
  "patchFile": "$patch_path_for_state"
}
EOF
}

COMMAND="${1:-help}"
if [ "$COMMAND" = "help" ]; then
  usage
  exit 0
fi
shift || true

while [ "$#" -gt 0 ]; do
  case "$1" in
    --remote)
      REMOTE="$2"
      shift 2
      ;;
    --ref)
      REF="$2"
      shift 2
      ;;
    --patch-file)
      PATCH_FILE=$(resolve_path "$2")
      STATE_FILE="$(dirname "$PATCH_FILE")/state.json"
      shift 2
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

mkdir -p "$(dirname "$PATCH_FILE")"

case "$COMMAND" in
  patch)
    git -C "$SUBMODULE_PATH" diff --binary --no-ext-diff >"$PATCH_FILE"
    write_state "HEAD"
    printf '[zmx] patch written to %s\n' "$PATCH_FILE"
    ;;
  apply)
    if [ ! -f "$PATCH_FILE" ]; then
      printf '[zmx] patch file not found: %s\n' "$PATCH_FILE" >&2
      exit 1
    fi
    if [ ! -s "$PATCH_FILE" ]; then
      printf '[zmx] patch is empty, skipping\n'
      exit 0
    fi
    if git -C "$SUBMODULE_PATH" apply --reverse --check "$PATCH_FILE" >/dev/null 2>&1; then
      printf '[zmx] patch already applied, skipping\n'
      exit 0
    fi
    git -C "$SUBMODULE_PATH" apply --check "$PATCH_FILE"
    git -C "$SUBMODULE_PATH" apply --reject --whitespace=nowarn "$PATCH_FILE"
    write_state "HEAD"
    printf '[zmx] patch applied from %s\n' "$PATCH_FILE"
    ;;
  sync)
    git -C "$SUBMODULE_PATH" fetch "$REMOTE" --prune
    TARGET_REF="$REF"
    case "$TARGET_REF" in
      */*) ;;
      *) TARGET_REF="$REMOTE/$TARGET_REF" ;;
    esac
    git -C "$SUBMODULE_PATH" reset --hard "$(git -C "$SUBMODULE_PATH" rev-parse "$TARGET_REF")"
    git -C "$SUBMODULE_PATH" clean -fd
    if [ -f "$PATCH_FILE" ] && [ -s "$PATCH_FILE" ]; then
      git -C "$SUBMODULE_PATH" apply --check "$PATCH_FILE"
      git -C "$SUBMODULE_PATH" apply --reject --whitespace=nowarn "$PATCH_FILE"
      printf '[zmx] patch applied from %s\n' "$PATCH_FILE"
    else
      printf '[zmx] no patch found at %s, skipping patch apply\n' "$PATCH_FILE"
    fi
    write_state "$TARGET_REF"
    printf '[zmx] sync complete at %s\n' "$(git -C "$SUBMODULE_PATH" rev-parse HEAD)"
    ;;
  *)
    usage
    exit 1
    ;;
esac
