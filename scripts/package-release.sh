#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: sh ./scripts/package-release.sh <version>" >&2
  exit 1
fi

VERSION="$1"
mkdir -p dist

ARCH="$(uname -m)"
if [ -n "${RUNNER_OS:-}" ]; then
  OS_NAME="$RUNNER_OS"
else
  OS_NAME="$(uname -s)"
fi

case "$OS_NAME" in
  Linux)
    PLATFORM="linux"
    ;;
  macOS|Darwin)
    PLATFORM="macos"
    ;;
  *)
    echo "Unsupported platform: $OS_NAME" >&2
    exit 1
    ;;
esac

NAME="supaterm-server-v${VERSION}-${PLATFORM}-${ARCH}"
cp zig-out/bin/supaterm-server "dist/${NAME}"
tar -C dist -czf "dist/${NAME}.tar.gz" "${NAME}"
shasum -a 256 "dist/${NAME}.tar.gz" > "dist/${NAME}.tar.gz.sha256"
