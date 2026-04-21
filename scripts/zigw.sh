#!/bin/sh
set -eu

required_version="${SUPATERM_ZIG_VERSION:-0.15.2}"

resolve_candidate() {
  candidate="$1"
  if [ -x "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  if command -v "$candidate" >/dev/null 2>&1; then
    command -v "$candidate"
    return 0
  fi
  return 1
}

run_if_matching() {
  candidate="$1"
  shift
  if ! resolved="$(resolve_candidate "$candidate")"; then
    return 1
  fi
  version="$("$resolved" version 2>/dev/null || true)"
  if [ "$version" = "$required_version" ]; then
    exec "$resolved" "$@"
  fi
  return 1
}

if [ "$(uname)" = "Darwin" ]; then
  run_if_matching /opt/homebrew/bin/zig "$@" || true
fi

run_if_matching zig "$@" || exec zig "$@"
