# Data Contracts

## HTTP Routes

Health:
- `GET /health`

Session metadata:
- `GET /api/sessions/{id}`

Terminal attach:
- `GET /api/sessions/{id}/ws`

Share grant:
- `GET /api/sessions/{id}/share`
- only available when `--enable-share-api` is enabled

## Canonical Session ID

Session IDs are canonicalized at the HTTP boundary.

Allowed after percent-decoding:
- `A-Z`
- `a-z`
- `0-9`
- `.`
- `_`
- `-`
- `:`

Equivalent encoded URLs normalize to the same canonical session ID.

## Metadata Payload

`GET /api/sessions/{id}` returns descriptive JSON only.

Current shape:
```json
{
  "session_id": "ws.example.tab.example.pane.example",
  "token_policy": "open",
  "token_required": false,
  "websocket_path": "/api/sessions/ws.example.tab.example.pane.example/ws",
  "share_authority": "server",
  "share_token_transport": "query",
  "share_api_enabled": true,
  "share_api_path": "/api/sessions/ws.example.tab.example.pane.example/share"
}
```

## Share Grant Payload

`GET /api/sessions/{id}/share` returns a concrete share grant when enabled.

Current shape:
```json
{
  "session_id": "ws.example.tab.example.pane.example",
  "websocket_path": "/api/sessions/ws.example.tab.example.pane.example/ws",
  "token": "hex-or-null",
  "token_transport": "query",
  "share_authority": "server",
  "expires_at_unix_ms": null
}
```

## WebSocket Contract

Attach path:
- `/api/sessions/{id}/ws`

Token transport:
- query string today: `?token=...`

Current message split:
- terminal payload: binary/text stream to and from the backend
- control payload: JSON for small control messages such as resize

Current resize frame:
```json
{
  "type": "resize",
  "cols": 132,
  "rows": 43
}
```

## Token Policies

- `open`: no token required
- `global`: one shared token via `--access-token`
- `session`: deterministic per-session token via `HMAC-SHA256(secret, canonical_session_id)`

## Persistence Contract

Browser workbench state persists locally and restores on reload:
- workspaces
- active workspace
- tabs
- active tab
- pane tree
- active pane
- renamed titles
- sidebar collapsed state

This persistence is UI state only. Backend session continuity comes from the stable pane session IDs and the selected backend mode.
