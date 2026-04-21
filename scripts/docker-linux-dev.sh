#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "usage: sh ./scripts/docker-linux-dev.sh <shell|setup|check|test|browser>" >&2
  exit 1
fi

command_name="$1"
shift

run_compose() {
  docker compose run --rm linux-dev bash -lc "$1"
}

case "$command_name" in
  shell)
    exec docker compose run --rm linux-dev bash
    ;;
  setup)
    run_compose "mise trust mise.toml && mise install && mise run setup"
    ;;
  check)
    run_compose "mise trust mise.toml && mise install && mise run check"
    ;;
  test)
    run_compose "mise trust mise.toml && mise install && mise exec -- bun run test"
    ;;
  browser)
    run_compose "mise trust mise.toml && mise install && bunx playwright install --with-deps chromium && mise exec -- bun run test:browser"
    ;;
  *)
    echo "unknown command: $command_name" >&2
    exit 1
    ;;
esac
