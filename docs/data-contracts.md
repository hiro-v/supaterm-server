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

Workbench snapshot:
- `GET /api/workbench/{id}`
- `PUT /api/workbench/{id}`

Shell capabilities:
- `GET /api/capabilities/shells`

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

Optional shell selection:
- query string today: `?shell=fish|zsh|bash|sh`
- omitted means `system` and defers to the host process `SHELL` or `/bin/sh`

Current message split:
- terminal payload: binary/text stream to and from the backend
- control payload: JSON for small control messages such as resize

Current attach control frame:
```json
{
  "type": "supaterm.attach-trace",
  "session_reused": true,
  "session_age_ms": 1250,
  "output_pump_started_ms": 0,
  "first_backend_read_ms": 5,
  "first_broadcast_ms": 5
}
```

Current resize frame:
```json
{
  "type": "resize",
  "cols": 132,
  "rows": 43
}
```

## Shell Capabilities Payload

`GET /api/capabilities/shells` returns:

```json
{
  "default_shell": "zsh",
  "shells": [
    { "id": "fish", "available": false, "path": null },
    { "id": "zsh", "available": true, "path": "/bin/zsh" },
    { "id": "bash", "available": true, "path": "/bin/bash" },
    { "id": "sh", "available": true, "path": "/bin/sh" }
  ]
}
```

The web UI uses this to disable unavailable shells in the per-pane selector instead of guessing from the platform.

## Token Policies

- `open`: no token required
- `global`: one shared token via `--access-token`
- `session`: deterministic per-session token via `HMAC-SHA256(secret, canonical_session_id)`

## Persistence Contract

Browser workbench state now has two layers:
- server-owned shared snapshot in SQLite
- browser-local cache for fast startup and offline/error tolerance

`GET /api/workbench/{id}` returns:

```json
{
  "workbench_id": "shared.workbench:v1",
  "updated_at_unix_ms": 1760000000000,
  "state": {
    "workspaces": [],
    "activeWorkspaceId": "ws.1",
    "sidebarCollapsed": false
  }
}
```

`PUT /api/workbench/{id}` accepts the raw `WorkbenchState` JSON object and returns `204 No Content`.

Auth follows the same token policy as the session routes for the same canonical id.

The shared snapshot contains:
- workspaces
- active workspace
- tabs
- active tab
- pane tree
- active pane
- per-pane shell choice
- workbench appearance preferences
- renamed titles
- sidebar collapsed state

Appearance preferences currently include:
- font preset and font family
- font size
- cursor blink
- terminal theme colors
- workbench chrome palette

Backend session continuity comes from the stable pane session IDs and the selected backend mode. For `zmx`, that is the intended fresh-browser restore path: fetch the shared workbench snapshot, rebuild the workspace/tab/pane layout, then reattach each pane to the same backend session id. When a pane session id already names a real local `zmx` session, the server now probes and attaches to that raw session first; otherwise it falls back to Supaterm's deterministic hashed `sess-...` alias.
