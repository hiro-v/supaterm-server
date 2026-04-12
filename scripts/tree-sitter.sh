#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BIN="$ROOT/node_modules/.bin/tree-sitter"
CONFIG_FILE=$(mktemp)

cleanup() {
  rm -f "$CONFIG_FILE"
}
trap cleanup EXIT INT TERM

cat >"$CONFIG_FILE" <<EOF
{
  "parser-directories": [
    "$ROOT/node_modules",
    "$ROOT/node_modules/@tree-sitter-grammars"
  ]
}
EOF

usage() {
  cat <<'EOF'
Usage:
  sh ./scripts/tree-sitter.sh parse <zig|ts|typescript> <paths...>
  sh ./scripts/tree-sitter.sh query <zig|ts|typescript> <query-file> <paths...>
EOF
}

grammar_path() {
  case "$1" in
    zig)
      printf '%s\n' "$ROOT/node_modules/@tree-sitter-grammars/tree-sitter-zig"
      ;;
    ts|typescript)
      printf '%s\n' "$ROOT/node_modules/tree-sitter-typescript/typescript"
      ;;
    *)
      printf 'unknown language: %s\n' "$1" >&2
      exit 1
      ;;
  esac
}

COMMAND=${1:-}
[ -n "$COMMAND" ] || {
  usage
  exit 1
}
shift

LANGUAGE=${1:-}
[ -n "$LANGUAGE" ] || {
  usage
  exit 1
}
shift

GRAMMAR=$(grammar_path "$LANGUAGE")

case "$COMMAND" in
  parse)
    [ "$#" -gt 0 ] || {
      usage
      exit 1
    }
    exec "$BIN" parse --config-path "$CONFIG_FILE" --grammar-path "$GRAMMAR" "$@"
    ;;
  query)
    QUERY_FILE=${1:-}
    [ -n "$QUERY_FILE" ] || {
      usage
      exit 1
    }
    shift
    [ "$#" -gt 0 ] || {
      usage
      exit 1
    }
    exec "$BIN" query --config-path "$CONFIG_FILE" --grammar-path "$GRAMMAR" "$QUERY_FILE" "$@"
    ;;
  *)
    usage
    exit 1
    ;;
esac
