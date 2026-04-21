# Skill: Zig Server

Use this when changing the server runtime, HTTP endpoints, WebSocket serving, or backend integration.

## Boundaries

- `src/main.zig`: process config, HTTP/WebSocket serving, asset serving
- `src/session_manager.zig`: session lifecycle, authorization seam, share issuance seam
- `src/session_http.zig`: session path parsing, query decoding, JSON payload shaping
- `src/session_backends.zig`: local PTY backend and `zmx` backend

## Rules

- Keep request parsing out of the runtime layer.
- Keep runtime policy out of the HTTP transport layer.
- Maintain Linux-first assumptions unless a change is clearly host-seam work.
- If you touch session attach/share behavior, verify both metadata and live attach paths.

## Verification

Minimum:
```bash
zig build check
bun run zig:lint
```

`bun run zig:lint` resolves through the repo wrapper in `scripts/zlint.sh`.

When session APIs change:
```bash
bun run test:integration
bun run test:contract
```

When `zmx` behavior changes:
```bash
bun run test:e2e
bun run zmx:smoke
```
