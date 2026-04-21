#!/usr/bin/env sh
set -eu

if [ -n "${ZLINT_BIN:-}" ] && [ -x "${ZLINT_BIN}" ]; then
  exec "${ZLINT_BIN}" "$@"
fi

if command -v zlint >/dev/null 2>&1; then
  exec zlint "$@"
fi

if command -v ghq >/dev/null 2>&1; then
  REPO="$(ghq root)/github.com/DonIsaac/zlint"
  BIN="${REPO}/zig-out/bin/zlint"

  if [ -d "${REPO}" ]; then
    if [ ! -x "${BIN}" ]; then
      printf '[zlint] building from %s\n' "${REPO}" >&2
      (
        cd "${REPO}"
        zig build --release=safe
      )
    fi
    exec "${BIN}" "$@"
  fi
fi

cat >&2 <<'EOF'
zlint not found.

Expected one of:
- zlint available on PATH
- ZLINT_BIN pointing to an executable
- a local ghq clone at github.com/DonIsaac/zlint

Install or fetch it with:
  ghq get github.com/DonIsaac/zlint
EOF
exit 127
