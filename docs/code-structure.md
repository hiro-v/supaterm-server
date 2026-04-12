# Code Structure Notes

This repository is intentionally split so the standalone Zig server remains reusable when the hosting model changes later.

## Zig server boundaries

Current split:
- `src/session_manager.zig`
  - session lifecycle
  - backend selection seam
  - authorization seam
  - share issuance seam
  - no HTTP path parsing
  - no HTTP JSON formatting
- `src/session_http.zig`
  - canonical session path parsing
  - query parsing for WebSocket attach
  - resize frame parsing
  - HTTP-facing payload shaping
- `src/session_backends.zig`
  - local PTY backend
  - zmx backend
- `src/main.zig`
  - process config
  - HTTP serving
  - WebSocket upgrade loop

Why this split:
- The runtime layer should not know how HTTP encodes or exposes it.
- The HTTP layer can evolve independently without forcing backend or host API churn.
- Swift embedding later can reuse `SessionManager` without inheriting the current HTTP presentation shape.

## Web boundaries

Current split:
- `web/src/main.ts`
  - startup only
- `web/src/session.ts`
  - URL/query parsing
  - WebSocket URL construction
  - transport payload decoding
- `web/src/terminal-client.ts`
  - terminal to WebSocket wiring
  - pane-local telemetry and focus behavior
- `web/src/workbench/state.ts`
  - pure workbench data structures and tree transforms
- `web/src/workbench/persistence.ts`
  - injected persistence boundary
- `web/src/workbench/commands.ts`
  - pure command model and filtering
- `web/src/workbench/sidebar.ts`
  - sidebar/header/footer rendering
- `web/src/workbench/overlay.ts`
  - dialog and command-palette rendering
- `web/src/workbench/panes.ts`
  - pane tree rendering
  - injected pane client factory
  - injected session resolution
- `web/src/shims/fs-promises.ts`
  - browser-only containment for Node fs imports that appear in vendored `libghosty` source

Why this split:
- The entrypoint stays thin.
- Transport rules are reusable across future views.
- Workbench state, persistence, rendering, and terminal lifecycles can evolve independently.
- `libghosty` remains isolated to the terminal adapter boundary instead of leaking across app bootstrap code.
- Node-only imports from vendored code are contained at the Vite boundary instead of being allowed to leak into the browser bundle surface.
- Hook, workflow, and cache setup stay outside the runtime modules and can be tested independently as repo tooling components.

## Dependency Injection

Current explicit seams:
- `WorkbenchPersistence`
  - `load(seedSessionId)`
  - `persist(state)`
- `PaneClientFactory`
  - creates live terminal clients for pane mounts
- `PaneSessionResolver`
  - maps workspace/tab/pane state into terminal session connection details
- `AppRuntime`
  - shared browser capability detection
  - shared latency probe
  - renderer creation

Why:
- component tests should not require a live WebSocket or terminal renderer
- state modules should not know about `window.localStorage`
- pane tree rendering should not know how sessions are authenticated
- terminal rendering should not know how the workbench stores layout state

## Duplication policy

Rules currently enforced by structure:
- scalar parsing helpers live in `src/parse_utils.zig`
- session routing logic lives in one Zig module
- browser transport decode logic lives in one TypeScript module
- workbench persistence is isolated from workbench state shape
- pane tree rendering is isolated from live pane client construction
- patch workflow behavior is exercised through dedicated unit tests instead of implicit trust
- hook and CI workflow behavior is exercised through dedicated unit tests instead of relying only on GitHub to catch regressions

If a concern touches:
- terminal runtime only: put it in `session_manager.zig` or `session_backends.zig`
- HTTP route or payload shape only: put it in `session_http.zig`
- browser URL or message transport only: put it in `web/src/session.ts`
- browser layout state only: put it in `web/src/workbench/state.ts`
- browser persistence only: put it in `web/src/workbench/persistence.ts`
- browser pane client lifecycle only: put it in `web/src/workbench/panes.ts`
- browser overlay/dialog rendering only: put it in `web/src/workbench/overlay.ts`

## Tree-sitter workflow

The repository now includes local AST tooling for Zig and TypeScript:
- `bun run ast:zig:parse`
- `bun run ast:zig:functions`
- `bun run ast:ts:parse`
- `bun run ast:ts:functions`
- `bun run ast:scan`

Implementation:
- CLI wrapper: `scripts/tree-sitter.sh`
- Zig query examples: `tools/tree-sitter/queries/zig/`
- TypeScript query examples: `tools/tree-sitter/queries/typescript/`

This is intended for:
- finding duplicate helpers,
- checking whether refactors actually reduced top-level complexity,
- locating function ownership before moving code between modules.
