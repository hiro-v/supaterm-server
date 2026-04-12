# Skill: Verification

Use this when deciding the minimum acceptable proof for a change.

## Test Layers

- `bun run test:unit`: helper logic and parser tests
- `bun run test:integration`: live local backend HTTP/WebSocket behavior
- `bun run test:contract`: JSON shape and data contract tests
- `bun run test:e2e`: `zmx`-backed live round-trip
- `bun run test:browser`: Chromium workbench behavior
- `bun run harness`: repo-wide deterministic phase checks

## Selection Guide

- UI-only changes: `web:typecheck`, `test:browser`, `web:build`
- Zig parser/runtime changes: `zig build check`, then integration or contract tests as needed
- Share/session contract changes: `test:integration` and `test:contract`
- Vendored backend changes: `test:e2e` and `zmx:smoke`
- Release readiness: `harness`
