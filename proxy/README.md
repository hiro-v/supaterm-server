# supaterm-share-proxy

Cloudflare Worker + Durable Object relay for Supaterm sharing.

## Purpose

This package provides the public relay layer for a future `tty-share`-style flow:

1. the host opens a WebSocket to the relay
2. guests connect to the same `share_id`
3. the Durable Object keyed by that `share_id` coordinates traffic

The package is intentionally Cloudflare-only. It does not embed or replace the Zig runtime.

## Structure

- `src/index.ts`: Worker entrypoint and public route dispatch
- `src/http.ts`: route parsing and response helpers
- `src/config.ts`: env parsing and host-auth helpers
- `src/protocol.ts`: explicit host/guest/relay message contracts
- `src/share-relay.ts`: Durable Object runtime
- `src/relay/share-metadata.ts`: share metadata and expiry helpers
- `src/relay/share-sockets.ts`: socket attachment and lookup helpers

## Routes

- `GET /health`
- `GET /api/shares/{share_id}`
- `GET /api/shares/{share_id}/host` WebSocket upgrade
- `GET /api/shares/{share_id}/guest` WebSocket upgrade

## Environment

- `HOST_SHARED_SECRET`: optional shared secret for host registration
- `MAX_SHARE_TTL_SECONDS`: relay-side TTL cap, defaults to `3600`

## Commands

```bash
bun run dev
bun run typecheck
bun run build
bun run deploy
```

## Notes

- The Worker validates routes before forwarding to the Durable Object.
- The Durable Object uses WebSocket hibernation-friendly APIs and alarms for expiry.
- The relay only routes and relays; validation and share policy stay with the Zig host.
- The host chooses share mode and title when it registers a socket, and forwards the Zig-issued `expiresAtUnixMs`.
- The relay defaults missing or invalid expiries to 60 minutes ahead and caps longer requests to keep Durable Object state short-lived.
