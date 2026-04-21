#!/usr/bin/env sh
set -eu

ROOT="${SUPATERM_ROOT_OVERRIDE:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
PACKAGE_PATH="${SUPATERM_LIBGHOSTTY_PACKAGE_PATH:-third_party/libghostty}"
SUBMODULE_PATH="$ROOT/$PACKAGE_PATH"
GHOSTTY_PATH="${SUPATERM_LIBGHOSTTY_GHOSTTY_PATH:-$ROOT/$PACKAGE_PATH/ghostty}"
PATCH_DIR="${SUPATERM_LIBGHOSTTY_PATCH_DIR:-$ROOT/patches/libghosty}"
PATCH_FILE="${SUPATERM_LIBGHOSTTY_PATCH_FILE:-$PATCH_DIR/libghosty.patch}"
STATE_FILE="${SUPATERM_LIBGHOSTTY_STATE_FILE:-$PATCH_DIR/state.json}"
REMOTE="${SUPATERM_LIBGHOSTTY_REMOTE:-origin}"
REF="${SUPATERM_LIBGHOSTTY_REF:-main}"
BUILD="${SUPATERM_LIBGHOSTTY_BUILD:-0}"

usage() {
  cat <<'EOF'
Usage:
  sh ./scripts/libghosty-patch.sh patch [--patch-file path]
  sh ./scripts/libghosty-patch.sh apply [--patch-file path]
  sh ./scripts/libghosty-patch.sh sync [--remote origin] [--ref main] [--patch-file path] [--build]

This workflow patches the real upstream ghostty submodule. Wrapper files under
third_party/libghostty/ remain normal repo files and should be committed
directly in the main repository.
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
  upstream_commit=$(git -C "$GHOSTTY_PATH" rev-parse HEAD)
  updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat >"$STATE_FILE" <<EOF
{
  "upstreamRef": "$1",
  "upstreamCommit": "$upstream_commit",
  "updatedAt": "$updated_at",
  "patchFile": "$PATCH_FILE"
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
    --build)
      BUILD=1
      shift
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
    git -C "$GHOSTTY_PATH" diff --binary --no-ext-diff >"$PATCH_FILE"
    write_state "HEAD"
    printf '[libghosty] patch written to %s\n' "$PATCH_FILE"
    ;;
  apply)
    if [ ! -f "$PATCH_FILE" ]; then
      printf '[libghosty] patch file not found: %s\n' "$PATCH_FILE" >&2
      exit 1
    fi
    if [ ! -s "$PATCH_FILE" ]; then
      printf '[libghosty] patch is empty, skipping\n'
      exit 0
    fi
    if git -C "$GHOSTTY_PATH" apply --reverse --check "$PATCH_FILE" >/dev/null 2>&1; then
      printf '[libghosty] patch already applied, skipping\n'
      exit 0
    fi
    git -C "$GHOSTTY_PATH" apply --check "$PATCH_FILE"
    git -C "$GHOSTTY_PATH" apply --reject --whitespace=nowarn "$PATCH_FILE"
    write_state "HEAD"
    printf '[libghosty] patch applied from %s\n' "$PATCH_FILE"
    ;;
  sync)
    git -C "$GHOSTTY_PATH" fetch "$REMOTE" --prune
    TARGET_REF="$REF"
    case "$TARGET_REF" in
      */*) ;;
      *) TARGET_REF="$REMOTE/$TARGET_REF" ;;
    esac
    git -C "$GHOSTTY_PATH" reset --hard "$(git -C "$GHOSTTY_PATH" rev-parse "$TARGET_REF")"
    git -C "$GHOSTTY_PATH" clean -fd
    if [ -f "$PATCH_FILE" ] && [ -s "$PATCH_FILE" ]; then
      if git -C "$GHOSTTY_PATH" apply --reverse --check "$PATCH_FILE" >/dev/null 2>&1; then
        printf '[libghosty] upstream patch already applied, skipping\n'
      else
        git -C "$GHOSTTY_PATH" apply --check "$PATCH_FILE"
        git -C "$GHOSTTY_PATH" apply --reject --whitespace=nowarn "$PATCH_FILE"
        printf '[libghosty] upstream patch applied from %s\n' "$PATCH_FILE"
      fi
    else
      printf '[libghosty] no patch found at %s, skipping patch apply\n' "$PATCH_FILE"
    fi
    if [ "$BUILD" -eq 1 ]; then
      (
        cd "$SUBMODULE_PATH"
        bun run build
      )
    fi
    write_state "$TARGET_REF"
    printf '[libghosty] sync complete at %s\n' "$(git -C "$GHOSTTY_PATH" rev-parse HEAD)"
    ;;
  *)
    usage
    exit 1
    ;;
esac
