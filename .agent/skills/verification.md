# Skill: Verification

Use this when deciding the minimum acceptable proof for a change.

## Test Layers

- `mise exec -- bun run test:unit`: helper logic and parser tests
- `mise exec -- bun run test:integration`: live local backend HTTP/WebSocket behavior
- `mise exec -- bun run test:contract`: JSON shape and data contract tests
- `mise exec -- bun run test:e2e`: `zmx`-backed live round-trip
- `mise exec -- bun run test:browser`: Chromium workbench behavior
- `bun run docker:linux:check`: local Linux parity check from a dev container
- `bun run docker:linux:test`: local Linux parity full test run from a dev container
- `mise exec -- bun run harness`: repo-wide deterministic phase checks
- default command bundles:
  - `mise run check`
  - `mise run release`

## Selection Guide

- UI-only changes: `mise exec -- bun run web:typecheck`, `mise exec -- bun run test:browser`, `mise exec -- bun run web:build`
- Zig parser/runtime changes: `mise exec -- zig build check`, then integration or contract tests as needed
- Share/session contract changes: `mise exec -- bun run test:integration` and `mise exec -- bun run test:contract`
- Vendored backend changes: `mise exec -- bun run test:e2e` and `mise exec -- bun run zmx:smoke`
- Release readiness: `mise exec -- bun run harness`
- Linux-sensitive local changes on macOS: `bun run docker:linux:check`, then `bun run docker:linux:test` if needed
