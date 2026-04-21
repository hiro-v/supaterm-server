# Swift Host Integration Contract

This document defines the server-side contract that a future Supaterm Swift host should rely on.

The goal is to keep `supaterm-server` runnable on its own on Linux first, while making host-owned policy injection straightforward later on macOS.

## Current Stable Surface

HTTP routes:
- `GET /health`
- `GET /api/sessions/{id}`
- `GET /api/sessions/{id}/ws`
- `GET /api/sessions/{id}/share` only when `--enable-share-api` is enabled

Stable session identity:
- Session IDs are canonicalized at the HTTP boundary.
- Allowed characters after percent-decoding: `A-Z`, `a-z`, `0-9`, `.`, `_`, `-`, `:`
- Equivalent URLs normalize to the same canonical session ID.

Metadata route:
- `GET /api/sessions/{id}` is descriptive only.
- It does not return raw share tokens.
- It returns canonical routing and policy metadata:
  - `session_id`
  - `token_policy`
  - `token_required`
  - `websocket_path`
  - `share_authority`
  - `share_token_transport`
  - `share_api_enabled`
  - `share_api_path`

Share grant route:
- `GET /api/sessions/{id}/share` returns a concrete share grant only when the operator explicitly enables it.
- Default standalone shape:
  - `session_id`
  - `websocket_path`
  - `token`
  - `token_transport`
  - `share_authority`
  - `expires_at_unix_ms`

## Embedding Seams

`SessionManager` exposes three host hooks:
- `setBackendFactory(...)`
- `setAuthorizer(...)`
- `setShareIssuer(...)`

Their intended ownership is:
- `BackendFactory`: host decides how sessions are created or attached.
- `Authorizer`: host decides whether an attach token is valid for a canonical session ID.
- `ShareIssuer`: host mints the share grant payload that the web layer consumes.

This means Swift does not need to reimplement the HTTP or WebSocket transport contract. It only needs to own policy.

## Recommended Swift Ownership Model

The Swift app should own:
- canonical session ID generation for sessions it wants to publish,
- durable share state and ACLs,
- invite token minting and expiry policy,
- user/session ownership checks,
- persistence of share metadata if a reconnectable or revocable share is required.

The Zig server should continue to own:
- HTTP serving,
- WebSocket framing,
- terminal session attach/detach,
- local backend and `zmx` backend runtime behavior.

## Share Token Strategy

Standalone mode can use the built-in token policies:
- `open`
- `global`
- `session`

Embedded mode should prefer host-issued grants over exposing a server-derived secret directly.

Recommended production pattern for Swift:
1. Swift chooses the canonical session ID.
2. Swift persists share state keyed by that canonical ID.
3. Swift installs `setAuthorizer(...)` to validate incoming viewer tokens.
4. Swift installs `setShareIssuer(...)` to mint view tokens or invite grants.
5. Web clients consume `/api/sessions/{id}` for capability discovery and either:
   - receive a share grant from the host out of band, or
   - call the share endpoint only if the host intentionally exposes it.

## Compatibility Notes

The current server keeps query-string token transport because the web client already supports `?token=...`.

If Swift later wants header-based auth, signed URLs, one-time invites, or revocable share tickets, those should be introduced behind `Authorizer` and `ShareIssuer` first so the transport contract remains compatible.

## Security Posture

Safe-by-default behavior:
- metadata does not leak raw tokens,
- share issuance is opt-in,
- attach authorization is centralized in one seam.

Do not treat `GET /api/sessions/{id}/share` as a public endpoint in embedded mode unless the host also installs an authorization layer in front of it.
