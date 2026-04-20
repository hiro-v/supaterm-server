# supaterm-server

Linux-first Supaterm server in Zig with a browser terminal UI built from a local `libghostty` wrapper and the upstream `ghostty` source.

The current MVP serves a multi-workspace, multi-tab, multi-pane web shell over WebSocket, supports a local PTY backend and a `zmx` backend, and keeps the server embeddable for a future host without coupling the runtime to Swift-specific policy.

The browser runtime is WebGPU-first for shell chrome, while the terminal surface currently defaults to the stable `libghostty` canvas adapter. The WebGPU terminal path remains in-tree behind the renderer adapter seam for continued development, but real browsers currently use the proven canvas terminal by default. For current browser support, check [Can I use: WebGPU](https://caniuse.com/webgpu).
The workbench is also split more aggressively now: shell view mounting, handler wiring, intent parsing, state transforms, mutations, pane rendering, persistence, and overlay rendering live behind separate modules instead of collapsing back into one controller file. The browser session path now reconnects automatically after socket loss and reuses the same stable pane session IDs.
Shared workbench layout is now server-owned through a small SQLite store. A fresh browser that opens the same `?session=` URL can fetch the persisted workspace/tab/pane snapshot from the server and rebuild the same layout even with empty local storage. Terminal continuity comes from reattaching those stable pane session IDs to the selected backend, which is the intended path for `zmx`.

## Quick Start

Requirements:
- Zig `0.15.x`
- `zlint` via `PATH`, `ZLINT_BIN`, or a local GHQ checkout of `github.com/DonIsaac/zlint`
- Bun `1.3.x`
- Git with submodule support

Bootstrap:
```bash
git submodule update --init --recursive
bun install
bun run hooks:install
```

Run the web server in dev mode:
```bash
zig build run
```

Local PTY startup defaults to `--shell-startup fast`, which skips user shell init files for supported shells (`bash`, `zsh`, `fish`) to reduce first-byte latency in the browser. Use `zig build run -- --shell-startup full` when you want the user shell's full init path instead.
Workbench snapshots default to `supaterm-server.sqlite3`; override that with `zig build run -- --sqlite-path /path/to/supaterm.sqlite3`.

Build the web bundle:
```bash
bun run web:build
```

The web and `zmx` scripts auto-apply tracked vendor patches before they build or test against vendored source. The browser bundle consumes the vendored `libghostty` TypeScript sources directly and uses the pinned `third_party/libghostty/ghostty-vt.wasm` artifact, so CI does not depend on Ghostty fetching extra upstream assets on every `web:build`.

## Verification

Fast paths:
```bash
bun run web:typecheck
bun run test:unit
bun run test:browser
zig build check
```

`bun run test:browser` self-hosts a temporary local server for the Playwright run. It no longer depends on a manually running server on port `3000`.

Full proof:
```bash
bun run test
bun run harness
```

Performance:
```bash
bun run perf:baseline
bun run perf:current
bun run perf:check
```

Git hooks:
- checked-in hook path: [.git-hooks/pre-commit](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.git-hooks/pre-commit)
- installer: `bun run hooks:install`
- planner/runtime: [scripts/pre-commit.ts](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/scripts/pre-commit.ts)

CI and release:
- test matrix: [.github/workflows/test.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/workflows/test.yml)
- shared cache/bootstrap action: [.github/actions/setup-ci/action.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/actions/setup-ci/action.yml)
- tip channel updater: [.github/workflows/release-tip.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/workflows/release-tip.yml)

The shared CI action also provisions `zlint` and exports `ZLINT_BIN` so Zig linting works on clean GitHub runners without relying on GHQ.
The test workflow also runs a non-blocking Ubuntu perf job that resolves a PR-base baseline when available, collects `.agent-harness/artifacts/perf-current.json`, runs `perf:check` against that baseline, uploads base/current/check artifacts, and appends a short renderer/runtime plus budget summary to the job summary, including current-vs-baseline deltas, startup marks, atlas resets, and retained GPU buffer capacities.

## Docs

Start here:
- Architecture: [docs/architecture.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/architecture.md)
- Stack: [docs/stack.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/stack.md)
- Tools and workflows: [docs/tools.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/tools.md)
- Data contracts: [docs/data-contracts.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/data-contracts.md)
- Upstream references: [docs/upstream-learnings.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/upstream-learnings.md)
- Terminal fidelity: [docs/terminal-fidelity.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/terminal-fidelity.md)

Supporting references:
- Agent workflow: [AGENTS.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/AGENTS.md)
- Code structure notes: [docs/code-structure.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/code-structure.md)
- Gap-closure exec plan: [docs/exec-plan-gap-closure.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/exec-plan-gap-closure.md)
- Performance baseline: [docs/performance-baseline.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/performance-baseline.md)
- Swift host contract: [docs/swift-host-integration.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/swift-host-integration.md)
- Harness overview: [.agent-harness/README.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.agent-harness/README.md)

## Third-Party Source Discipline

Vendored upstreams:
- `third_party/libghostty/ghostty`
- `third_party/zmx`

Local wrapper package:
- `third_party/libghostty`
- pinned runtime artifact: `third_party/libghostty/ghostty-vt.wasm`

Update them through tracked git patches, not ad hoc local edits:
```bash
bun run libghosty:patch
bun run libghosty:sync --ref <upstream-ref>

bun run zmx:patch
bun run zmx:sync --ref <upstream-ref>
```

Patch artifacts:
- `patches/libghosty/libghosty.patch`
- `patches/zmx/zmx.patch`

Zig linting:
- checked-in config: [zlint.json](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/zlint.json)
- command: `bun run zig:lint`
- wrapper: [scripts/zlint.sh](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/scripts/zlint.sh)

## Repo Layout

- `src/`: Zig server, session runtime, HTTP contract, backend adapters
- `web/`: TypeScript browser app and workbench UI
- `tests/`: unit, integration, contract, browser, and e2e tests
- `docs/`: high-signal project references
- `.agent/`: local agent instructions and reusable skills
- `.git-hooks/`: checked-in local Git hooks
- `.github/`: CI, cache, and tip release workflows
- `third_party/`: local wrappers plus real upstream submodules

## Design Rules

- keep modules small and self-contained
- prefer injected seams over hidden globals
- test each composable part directly
- treat hooks, workflow configs, and vendor patch scripts as testable components
- avoid leaking transport, persistence, or renderer details across module boundaries
