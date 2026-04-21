# Cloudflare Share Relay

This repository now includes a dedicated `proxy/` workspace for a Cloudflare-native share relay.

## Goal

Keep the Zig runtime local while using Cloudflare Workers plus Durable Objects as the public share edge:

```text
guest browser
  -> Cloudflare Worker
  -> Durable Object keyed by share id
  -> host WebSocket
  -> local supaterm-server
```

The relay package is intentionally isolated from the main Zig runtime:
- no Cloudflare logic in `src/main.zig`
- no Cloudflare logic in `src/session_manager.zig`
- no local `cloudflared` dependency
- no Cloudflare API key on the client

## Supaterm Host Setup

Run the local server as the policy source and keep it bound to localhost:

```bash
./zig-out/bin/supaterm-server \
  --listen 127.0.0.1:3000 \
  --backend local \
  --token-policy session \
  --share-grant-ttl-seconds 3600 \
  --enable-share-api \
  --share-token-secret "$SUPATERM_SHARE_TOKEN_SECRET"
```

That setup keeps validation in Zig:
- Zig decides whether a session can be published
- Zig issues the attach token and absolute expiry through `GET /api/sessions/{id}/share`
- the relay host chooses presentation fields such as `mode` and `title`
- the relay still enforces its own short-lived TTL cap so Durable Object state expires quickly

## Workspace

Files live under:
- `proxy/package.json`
- `proxy/wrangler.jsonc`
- `proxy/src/index.ts`
- `proxy/src/http.ts`
- `proxy/src/config.ts`
- `proxy/src/protocol.ts`
- `proxy/src/share-relay.ts`
- `proxy/src/relay/share-metadata.ts`
- `proxy/src/relay/share-sockets.ts`
- `proxy/README.md`

## Responsibilities

Worker:
- validate public routes
- reject malformed requests before they hit Durable Objects
- route each valid `share_id` to one Durable Object instance

Durable Object:
- one actor per `share_id`
- hold live host and guest WebSocket sessions
- persist share metadata and expiry
- relay terminal output from host to guests
- relay input and resize events from control guests to host
- expire shares with alarms

## Current Scope

This first slice focuses on relay protocol and Cloudflare package boundaries.

Included:
- Worker entrypoint and route parsing
- Durable Object relay skeleton with host/guest WebSocket coordination
- explicit JSON protocol types
- share metadata endpoint
- expiry handling through Durable Object alarms
- optional shared-secret guard for host registration
- host-owned share mode/title plus Zig-issued expiry passed at connect time
- relay-side TTL cap with a 60-minute default to keep state short-lived
- Zig remains the source of truth for validation and session policy
- an end-to-end repo test that bridges a live local Supaterm session through the relay

Not included yet:
- Zig host integration
- browser guest terminal UI
- end-to-end relay tests against Cloudflare
- persistent analytics or audit history

## Commands

From repo root:

```bash
bun run proxy:dev
bun run proxy:typecheck
bun run proxy:build
bun run proxy:deploy
```

Those delegate into the `proxy/` workspace.
