# supaterm-server

Linux-first Supaterm server in Zig with a browser terminal UI built from a local `libghostty` wrapper and the upstream `ghostty` source.

The current MVP serves a multi-workspace, multi-tab, multi-pane web shell over WebSocket, supports a local PTY backend and a `zmx` backend, and keeps the server embeddable for a future host without coupling the runtime to Swift-specific policy.
Each pane can now carry an explicit preferred shell (`fish`, `zsh`, `bash`, `sh`) while still degrading safely when a host does not provide one of those binaries.
The shared workbench snapshot also carries appearance preferences, so terminal theme/font changes persist to both browser local storage and the SQLite-backed server snapshot for fresh-browser restore.

The browser runtime is WebGPU-first for shell chrome, while the terminal surface currently defaults to the stable `libghostty` canvas adapter. The WebGPU terminal path remains in-tree behind the renderer adapter seam for continued development, but real browsers currently use the proven canvas terminal by default. For current browser support, check [Can I use: WebGPU](https://caniuse.com/webgpu).
The workbench is also split more aggressively now: shell view mounting, handler wiring, intent parsing, state transforms, mutations, pane rendering, persistence, and overlay rendering live behind separate modules instead of collapsing back into one controller file. The browser session path now reconnects automatically after socket loss and reuses the same stable pane session IDs.
The server also exposes `/api/capabilities/shells` so the web UI can offer per-pane shell choices without assuming those shells exist on every macOS/Linux host.
Shared workbench layout is now server-owned through a small SQLite store. A fresh browser that opens the same `?session=` URL can fetch the persisted workspace/tab/pane snapshot from the server and rebuild the same layout even with empty local storage. Terminal continuity comes from reattaching those stable pane session IDs to the selected backend, which is the intended path for `zmx`. The `zmx` backend now also probes for an already-existing raw session name before falling back to Supaterm's hashed `sess-...` alias, so the server can attach to pre-existing local `zmx` sessions when the pane session id matches that raw session name.

## Quick Start

Requirements:
- Zig `0.15.x`
- `zlint` via `PATH`, `ZLINT_BIN`, or a local GHQ checkout of `github.com/DonIsaac/zlint`
- Bun `1.3.x`
- Git with submodule support

Use the pinned toolchain via `mise` by default:
```bash
mise trust mise.toml
mise install
mise exec -- bun --version
mise exec -- zig version
```

Simplified default commands:
```bash
mise run setup
mise run dev
mise run check
mise run release
```

Equivalent repo scripts:
```bash
bun run setup
bun run dev
bun run check
bun run release
```

Bootstrap, expanded:
```bash
mise trust mise.toml
mise install
git submodule update --init --recursive
mise exec -- bun install
mise exec -- bun run hooks:install
```

Run the web server in dev mode:
```bash
mise exec -- zig build run
```

Local PTY startup defaults to `--shell-startup fast`, which skips user shell init files for supported shells (`bash`, `zsh`, `fish`) to reduce first-byte latency in the browser. Use `mise exec -- zig build run -- --shell-startup full` when you want the user shell's full init path instead.
Workbench snapshots default to `supaterm-server.sqlite3`; override that with `mise exec -- zig build run -- --sqlite-path /path/to/supaterm.sqlite3`.

Build the web bundle:
```bash
mise exec -- bun run web:build
```

The web and `zmx` scripts auto-apply tracked vendor patches before they build or test against vendored source. The browser bundle consumes the vendored `libghostty` TypeScript sources directly and uses the pinned `third_party/libghostty/ghostty-vt.wasm` artifact, so CI does not depend on Ghostty fetching extra upstream assets on every `web:build`.
The default browser terminal visual profile is now a blackout baseline: black background, white foreground, `MesloLGS NF` at `15px`, and explicit Nerd Font symbol fallback for private-use icon glyphs such as `yazi` file icons. Users can change theme colors and font selection from the workbench, and those preferences persist with the shared snapshot.

Build the single embedded release binary:
```bash
mise run release
```

The embedded build now always refreshes `web/dist`, generates a dynamic asset manifest under `src/.embedded-web/web_assets.generated.zig`, stages the built Bun output under `src/.embedded-web/`, and bundles that staged output into `zig-out/bin/supaterm-server`. The checked-in [src/web_assets.zig](src/web_assets.zig) is now just a thin wrapper over that generated manifest, so release packaging follows whatever files Vite/Bun actually emitted instead of a hard-coded asset list.

## Verification

Fast paths:
```bash
mise exec -- bun run web:typecheck
mise exec -- bun run test:unit
mise exec -- bun run test:browser
mise exec -- zig build check
```

`bun run test:browser` self-hosts a temporary local server for the Playwright run. It no longer depends on a manually running server on port `3000`.

Full proof:
```bash
mise exec -- bun run test
mise exec -- bun run harness
```

Performance:
```bash
mise exec -- bun run perf:baseline
mise exec -- bun run perf:current
mise exec -- bun run perf:check
```

Git hooks:
- installer: `bun run hooks:install`
- checked-in hook path: [.git-hooks/pre-commit](.git-hooks/pre-commit)
- planner/runtime: [scripts/pre-commit.ts](scripts/pre-commit.ts)

CI and release:
- test matrix: [.github/workflows/test.yml](.github/workflows/test.yml)
- shared cache/bootstrap action: [.github/actions/setup-ci/action.yml](.github/actions/setup-ci/action.yml)
- tip channel updater: [.github/workflows/release-tip.yml](.github/workflows/release-tip.yml)
- nightly patch prerelease: [.github/workflows/release-nightly.yml](.github/workflows/release-nightly.yml)
- production release: [.github/workflows/release-prod.yml](.github/workflows/release-prod.yml)

The shared CI action also provisions `zlint` and exports `ZLINT_BIN` so Zig linting works on clean GitHub runners without relying on GHQ.
The test workflow also runs a non-blocking Ubuntu perf job that resolves a PR-base baseline when available, collects `.agent-harness/artifacts/perf-current.json`, runs `perf:check` against that baseline, uploads base/current/check artifacts, and appends a short renderer/runtime plus budget summary to the job summary, including current-vs-baseline deltas, startup marks, atlas resets, and retained GPU buffer capacities.
Nightly releases now run at `00:00` GMT/UTC every day and via `workflow_dispatch`, bump the shared patch version automatically, create a `vX.Y.Z-nightly` tag, and publish macOS/Linux prerelease artifacts. Production releases are manual via `workflow_dispatch`, tag the current shared semver as `vX.Y.Z`, build the same macOS/Linux artifacts, and publish a GitHub release.

## Docs

Start here:
- Architecture: [docs/architecture.md](docs/architecture.md)
- Stack: [docs/stack.md](docs/stack.md)
- Tools and workflows: [docs/tools.md](docs/tools.md)
- Data contracts: [docs/data-contracts.md](docs/data-contracts.md)
- Upstream references: [docs/upstream-learnings.md](docs/upstream-learnings.md)
- Terminal fidelity: [docs/terminal-fidelity.md](docs/terminal-fidelity.md)

Supporting references:
- Agent workflow: [AGENTS.md](AGENTS.md)
- Code structure notes: [docs/code-structure.md](docs/code-structure.md)
- Gap-closure exec plan: [docs/exec-plan-gap-closure.md](docs/exec-plan-gap-closure.md)
- Performance baseline: [docs/performance-baseline.md](docs/performance-baseline.md)
- Swift host contract: [docs/swift-host-integration.md](docs/swift-host-integration.md)
- Harness overview: [.agent-harness/README.md](.agent-harness/README.md)

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
- checked-in config: [zlint.json](zlint.json)
- command: `bun run zig:lint`
- wrapper: [scripts/zlint.sh](scripts/zlint.sh)

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
