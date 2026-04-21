# Skill: Verification

Use this when deciding the minimum acceptable proof for a change.

## Test Layers

- `mise exec -- bun run test:unit`: helper logic and parser tests
- `mise exec -- bun run test:integration`: live local backend HTTP/WebSocket behavior
- `mise exec -- bun run test:contract`: JSON shape and data contract tests
- `mise exec -- bun run test:e2e`: `zmx`-backed live round-trip
- `mise exec -- bun run test:browser`: Chromium workbench behavior
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
