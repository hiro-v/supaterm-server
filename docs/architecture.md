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
- `src/session_backends.zig`: local PTY backend and `zmx` adapter
- `src/parse_utils.zig`: shared Zig parsing helpers

Web:
- `web/src/main.ts`: bootstrap
- `web/src/workbench.ts`: workbench controller and event orchestration
- `web/src/workbench/state.ts`: pure layout tree and workbench state model
- `web/src/workbench/persistence.ts`: injected persistence boundary
- `web/src/workbench/commands.ts`: command model and filtering
- `web/src/workbench/sidebar.ts`: sidebar/header/footer rendering
- `web/src/workbench/overlay.ts`: dialogs and command palette rendering
- `web/src/workbench/panes.ts`: pane tree rendering with injected pane client/session seams
- `web/src/session.ts`: session URL and message helpers
- `web/src/terminal-client.ts`: `libghosty` terminal adapter and telemetry
- `web/src/runtime/`: shared browser runtime, renderer abstraction, and adapter implementations
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

The browser app is split so the same terminal/session contract can support:
- the current workbench shell,
- future alternate views,
- future host-minted sharing flows.

The browser app also uses explicit seams so components remain lego-like:
- persistence is replaceable
- pane client construction is replaceable
- pane session resolution is replaceable
- renderer creation is replaceable

That keeps tests local and makes future renderer or host integration work additive instead of invasive.

## Source of Truth

Use these docs together:
- [docs/stack.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/stack.md)
- [docs/tools.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/tools.md)
- [docs/data-contracts.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/data-contracts.md)
- [docs/upstream-learnings.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/upstream-learnings.md)
