# Tools

## Core Commands

Bootstrap:
```bash
mise trust mise.toml
mise install
mise exec -- bun install
git submodule update --init --recursive
mise exec -- bun run hooks:install
```

Unified defaults:
```bash
mise run setup
mise run dev
mise run check
mise run release
```

Local Linux parity through Docker:
```bash
bun run docker:linux:setup
bun run docker:linux:check
bun run docker:linux:test
```

Pinned toolchain:
```bash
mise exec -- zig version
mise exec -- bun --version
```

Docker development environment:
```bash
docker compose build linux-dev
bun run docker:linux:shell
```

The local Docker path exists to let macOS developers exercise the Linux toolchain and tests locally. CI still runs on native Linux runners with `mise`, not inside Docker.

Server:
```bash
mise exec -- zig build
mise exec -- zig build run
mise exec -- zig build check
mise exec -- zig build --release=small -Dembed-assets=true
```

Direct CLI:
```bash
./zig-out/bin/supaterm-server --help
./zig-out/bin/supaterm-server --version
./zig-out/bin/supaterm-server --listen 0.0.0.0:3000
```

Local PTY shell startup:
```bash
mise exec -- zig build run -- --shell-startup fast
mise exec -- zig build run -- --shell-startup full
```

Shell capability probe:
```bash
curl http://127.0.0.1:3000/api/capabilities/shells
```

The web workbench uses that endpoint to populate the per-pane shell selector and disable missing shells on the current host.

`zmx` runtime examples:
```bash
./zig-out/bin/supaterm-server \
  --backend zmx \
  --zmx-socket-dir /tmp/zmx-501
```

That is the normal Supaterm-managed `zmx` mode. The browser workbench uses stable pane session IDs, and the backend creates or reuses the matching `zmx` sessions under that socket dir.

Attach to a pre-existing raw `zmx` session:
```bash
ZMX_DIR=/tmp/zmx-501 zmx list --short
./zig-out/bin/supaterm-server \
  --backend zmx \
  --zmx-socket-dir /tmp/zmx-501
```

If `zmx list --short` shows `work`, then opening `/?session=work` makes Supaterm probe `work` first before falling back to a hashed alias. If your local `zmx` naming uses a prefix, either use the prefixed name directly or start Supaterm with `--zmx-session-prefix <prefix>`.

Web:
```bash
mise exec -- bun run web:typecheck
mise exec -- bun run web:lint
mise exec -- bun run web:build
```

The embedded release path stages a generated copy of `web/dist` under `src/.embedded-web/` through [scripts/gen-web-assets.ts](../scripts/gen-web-assets.ts). That script now resolves the repo root relative to its own file path instead of `process.cwd()`, so it works from arbitrary working directories. It also generates `src/.embedded-web/web_assets.generated.zig` from the actual built Bun/Vite output, which keeps the embedded asset list reproducible and avoids a checked-in hard-coded file manifest.
The current terminal visual baseline is a blackout profile: black background, white foreground, `MesloLGS NF` at `15px`, with explicit Nerd Font symbol fallback for private-use icon glyphs.
The workbench persists appearance preferences through the normal snapshot path, so browser tests now cover reload/shared restore for theme/font changes too.

Tests:
```bash
mise exec -- bun run test:unit
mise exec -- bun run test:integration
mise exec -- bun run test:contract
mise exec -- bun run test:e2e
mise exec -- bun run test:browser
mise exec -- bun run perf:baseline
mise exec -- bun run perf:current
```

`test:browser` is self-contained. It boots a temporary local server, exports its base URL to Playwright, and shuts the server down after the browser run.
Before it boots the server, it also runs `bun run web:build` so clean runners always have `web/dist`.
It now also covers reconnect and hydration behavior, including reload/session reuse, fresh-browser shared snapshot restore, stable pane-session reattach, and browser socket reconnect after an explicit close.

Component-focused coverage in `test:unit` now includes:
- workbench state transforms
- workbench command generation
- workbench handler wiring
- workbench persistence
- workbench sidebar rendering
- workbench overlay rendering
- terminal hydration storage
- workbench pane-tree rendering through injected pane clients
- vendor patch workflow scripts for `libghosty` and `zmx`

`test:e2e` now also covers `zmx` reconnect reuse across websocket disconnects and attaching to a pre-existing raw `zmx` session name, so the persistent backend path is exercised directly.

Proof:
```bash
mise exec -- bun run harness
```

Performance baseline:
- collector: [scripts/perf-baseline.ts](../scripts/perf-baseline.ts)
- checked-in summary: [docs/performance-baseline.md](performance-baseline.md)
- current-run artifact: `.agent-harness/artifacts/perf-current.json`
- budget report artifact: `.agent-harness/artifacts/perf-check.json`
- CI base-branch baseline artifact: `.agent-harness/artifacts/perf-baseline.base.json`
- CI step summary includes current-vs-baseline deltas plus atlas resets and rect/glyph buffer capacities from the current run
- current startup drift can be broken down further through browser-side marks captured by `scripts/perf-baseline.ts`
  - `workbench-mounted`
  - `renderer-ready`
  - `websocket-open`
  - `first-terminal-bytes`
  - `first-pane-connected`

Local hooks:
```bash
mise exec -- bun run hooks:install
mise exec -- bun run hooks:pre-commit
```

The checked-in hook entrypoint is [.git-hooks/pre-commit](../.git-hooks/pre-commit), and the staging planner lives in [scripts/pre-commit.ts](../scripts/pre-commit.ts).

Zig lint:
```bash
mise exec -- bun run zig:lint
```

`bun run zig:lint` uses [scripts/zlint.sh](../scripts/zlint.sh), which prefers:
- `ZLINT_BIN`
- `zlint` on `PATH`
- a local GHQ checkout of `github.com/DonIsaac/zlint`

## Vendored Dependency Workflows

`libghosty`:
```bash
mise exec -- bun run libghosty:patch
mise exec -- bun run libghosty:apply
mise exec -- bun run libghosty:sync --ref <ref>
```

`zmx`:
```bash
mise exec -- bun run zmx:patch
mise exec -- bun run zmx:apply
mise exec -- bun run zmx:sync --ref <ref>
mise exec -- bun run zmx:smoke
```

The repo-level `web:*`, `test:e2e`, and `zmx:smoke` scripts auto-apply the tracked vendor patches first so a clean checkout remains reproducible.
`web:build` uses the vendored `libghostty` TypeScript source plus the pinned `third_party/libghostty/ghostty-vt.wasm` artifact. Rebuild that WASM explicitly from vendored Ghostty only when you intend to refresh it.

## AST and Inspection

Tree-sitter helpers:
```bash
bun run ast:zig:parse
bun run ast:zig:functions
bun run ast:ts:parse
bun run ast:ts:functions
bun run ast:scan
```

Use them to:
- find duplicate helpers,
- inspect module ownership before refactors,
- validate that code movement actually reduced complexity.

## Recommended Change Loops

Zig-only:
1. edit
2. `mise exec -- zig build check`
3. run integration/contract tests if APIs changed

Web-only:
1. edit
2. `mise exec -- bun run web:typecheck`
3. `mise exec -- bun run test:browser`
4. `mise exec -- bun run web:build`

Dependency patch:
1. edit the local wrapper or upstream submodule source
2. regenerate tracked patch
3. run the smallest proof for the affected surface

Patch workflow tests:
- `tests/unit/vendor-patch-scripts.unit.test.ts`
- the patch scripts accept environment path overrides so they can be tested in temporary Git repositories without coupling to this checkout

Hook and workflow config tests:
- `tests/unit/pre-commit.unit.test.ts`
- `tests/unit/ci-config.unit.test.ts`
- keep hook/workflow behavior explicit enough that local tests can assert the intended execution matrix and cache surfaces

## CI and Release

Primary workflows:
- test matrix: [.github/workflows/test.yml](../.github/workflows/test.yml)
- tip channel updater: [.github/workflows/release-tip.yml](../.github/workflows/release-tip.yml)
- nightly patch prerelease: [.github/workflows/release-nightly.yml](../.github/workflows/release-nightly.yml)
- production release: [.github/workflows/release-prod.yml](../.github/workflows/release-prod.yml)
- shared cache/bootstrap action: [.github/actions/setup-ci/action.yml](../.github/actions/setup-ci/action.yml)

Current CI policy:
- run Linux and macOS first
- restore Bun, Zig, build, and Playwright caches through the shared setup action
- provision `zlint` in CI and export `ZLINT_BIN` for the repo lint script
- checkout submodules recursively so vendored `ghostty` and `zmx` source are present before any build/test step
- publish a non-blocking Ubuntu perf base/current/check artifact set and step summary, resolving the PR base branch baseline when available before running `bun run perf:check`
- keep the `tip` prerelease channel aligned with `main` by force-moving the `tip` tag and refreshing the GitHub prerelease assets
- run a nightly `00:00` GMT/UTC patch bump workflow that updates the shared package version, pushes a `vX.Y.Z-nightly` tag, and publishes macOS/Linux prerelease binaries
- run a manual production workflow that tags the current shared package version as `vX.Y.Z` and publishes a GitHub release with macOS/Linux binaries
- keep GitHub Actions on native Linux/macOS runners with `mise`; Docker is only for local Linux dev parity

Shared version tooling:
```bash
bun run version:current
bun run version:bump:patch
bun run version:set -- 1.2.3
```

Those commands are backed by `scripts/release-version.ts`, which keeps the root `package.json` and `web/package.json` versions aligned.

## Git Discipline

- use conventional commits,
- keep vendor changes and local app changes logically grouped,
- prefer branch-local cleanup before opening a PR,
- do not leave generated browser reports or temporary artifacts tracked.
