# Architecture

## Goal

`supaterm-server` is a standalone terminal server that:
- runs on Linux first and macOS second,
- serves a browser terminal UI over WebSocket,
- supports local PTY sessions and `zmx`-backed shared sessions,
- stays host-embeddable through explicit backend, auth, and share seams.

## High-Level Shape

```text
browser workbench
  -> session metadata / share API (HTTP)
  -> terminal attach (WebSocket)
  -> Zig session runtime
  -> local PTY backend or zmx backend
```

## Main Modules

Server:
- `src/main.zig`: CLI, HTTP server, WebSocket upgrade, static asset serving
- `src/session_manager.zig`: session lifecycle, attach policy, auth/share injection seams
- `src/session_http.zig`: canonical path and payload contract
- `src/session_backends.zig`: local PTY backend, local shell-startup policy, and `zmx` adapter
- `src/workbench_store.zig`: SQLite-backed shared workbench snapshot store
- `src/parse_utils.zig`: shared Zig parsing helpers

Web:
- `web/src/main.ts`: bootstrap
- `web/src/workbench.ts`: workbench controller and event orchestration
- `web/src/workbench/state.ts`: pure layout tree and workbench state model
- `web/src/workbench/actions.ts`: workbench mutations, dialog builders, and active selection helpers
- `web/src/workbench/persistence.ts`: injected persistence boundary, local cache, and server snapshot hydration/persist
- `web/src/workbench/commands.ts`: command model and filtering
- `web/src/workbench/intents.ts`: click/double-click/keyboard intent parsing
- `web/src/workbench/dialogs.ts`: palette selection and dialog submission helpers
- `web/src/workbench/handlers.ts`: reusable handler maps for commands, actions, and keyboard flows
- `web/src/workbench/wiring.ts`: host-to-handler binding so workbench dispatch wiring stays out of the root class
- `web/src/workbench/resize.ts`: split-handle resize orchestration helpers
- `web/src/workbench/sidebar.ts`: sidebar/header/footer rendering
- `web/src/workbench/overlay.ts`: dialogs and command palette rendering
- `web/src/workbench/view.ts`: shell template and top-level DOM role binding
- `web/src/workbench/panes.ts`: pane tree rendering with injected pane client/session seams
- `web/src/perf.ts`: browser-side startup marks used by perf collection
- `web/src/session.ts`: session URL and message helpers
- `web/src/terminal-session.ts`: WebSocket session transport, token resolution, and resize-frame discipline
- `web/src/terminal-client.ts`: `libghosty` terminal adapter, reconnect logic, hydration replay, and telemetry
- `web/src/terminal-hydration.ts`: optional browser-local transcript cache for same-browser reconnect convenience
- `web/src/runtime/`: shared browser runtime, injected visual config, renderer abstraction, WebGPU-first terminal/chrome presentation, and fallback implementations
- `web/src/runtime/adapters/webgpu/`: buffer rasterizer and glyph atlas for the WebGPU terminal path
- `web/src/styles.css`: shell layout and visual system

Upstreams:
- `third_party/libghostty`: local TypeScript/WASM wrapper package learned from upstream `ghostty-web`
- `third_party/libghostty/ghostty`: real upstream `ghostty` submodule used to build `ghostty-vt.wasm`
- `third_party/zmx`: vendored persistence/session backend source

Reference architecture influences:
- `ghostty-web` for terminal-core integration and minimal upstream patching
- `restty` for browser renderer/runtime direction, especially pane runtime and future `WebGPU` support

## Reuse Boundaries

The project is split so the same Zig runtime can work in:
- standalone server mode,
- future embedded host mode,
- local PTY or `zmx` backend mode.

Local PTY sessions also keep shell startup policy explicit:
- `fast`: default for browser-first latency, skipping user init files on supported shells
- `full`: preserves the user shell's full interactive init path

The browser app is split so the same terminal/session contract can support:
- the current workbench shell,
- future alternate views,
- future host-minted sharing flows.

The browser app also uses explicit seams so components remain lego-like:
- persistence is replaceable
- pane client construction is replaceable
- terminal hydration storage is replaceable
- pane session resolution is replaceable
- visual config loading is replaceable
- renderer creation is replaceable
- workbench chrome surface creation is replaceable
- workbench event grammar is replaceable
- workbench shell view construction is replaceable
- workbench mutation logic is replaceable

Current browser compatibility rule:
- prefer WebGPU at runtime when the API, adapter, and device are available
- use a buffer-driven WebGPU terminal presenter first, not a copied fallback canvas
- keep `libghostty` as the VT/input/buffer core underneath that renderer path
- keep terminal text on a GPU glyph-quad path
- keep visible background and overlay decoration drawing on the GPU too
- keep CPU work limited to scene construction and metric/glyph-atlas preparation
- otherwise fall back to direct `libghostty` canvas rendering
- use live feature detection in code, and use [Can I use: WebGPU](https://caniuse.com/webgpu) as the external support reference

That keeps tests local and makes future renderer or host integration work additive instead of invasive.

Current reconnect/hydration rule:
- pane session IDs remain stable across reloads because they are derived from persisted workspace/tab/pane IDs
- browser reconnect is transport-first, so socket open no longer waits for renderer startup
- the server owns the shared workbench layout only
- the browser restores layout from the server snapshot, then reattaches each pane by its stable pane session id
- authoritative terminal state comes from the backend itself, which is the intended restore path for `zmx`
- `zmx` reconnect is treated as a first-class persistence path and is covered by e2e reuse checks

Current shared-layout rule:
- the top-level `?session=` query is also the shared workbench snapshot id
- `GET /api/workbench/{id}` and `PUT /api/workbench/{id}` are the server-owned layout source of truth
- the browser keeps a per-workbench local cache, but a fresh browser hydrates from the server snapshot first
- stable workspace/tab/pane ids from that shared snapshot preserve derived pane session ids for later backend reattach

## Source of Truth

Use these docs together:
- [docs/stack.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/stack.md)
- [docs/tools.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/tools.md)
- [docs/data-contracts.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/data-contracts.md)
- [docs/upstream-learnings.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/upstream-learnings.md)
