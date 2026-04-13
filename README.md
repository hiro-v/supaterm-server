# supaterm-server

Linux-first Supaterm server in Zig with a browser terminal UI built from a local `libghostty` wrapper and the upstream `ghostty` source.

The current MVP serves a multi-workspace, multi-tab, multi-pane web shell over WebSocket, supports a local PTY backend and a `zmx` backend, and keeps the server embeddable for a future host without coupling the runtime to Swift-specific policy.

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

Build the web bundle:
```bash
bun run web:build
```

The web and `zmx` scripts auto-apply tracked vendor patches before they build or test against vendored source.

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

Git hooks:
- checked-in hook path: [.git-hooks/pre-commit](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.git-hooks/pre-commit)
- installer: `bun run hooks:install`
- planner/runtime: [scripts/pre-commit.ts](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/scripts/pre-commit.ts)

CI and release:
- test matrix: [.github/workflows/test.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/workflows/test.yml)
- shared cache/bootstrap action: [.github/actions/setup-ci/action.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/actions/setup-ci/action.yml)
- tip channel updater: [.github/workflows/release-tip.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/workflows/release-tip.yml)

The shared CI action also provisions `zlint` and exports `ZLINT_BIN` so Zig linting works on clean GitHub runners without relying on GHQ.

## Docs

Start here:
- Architecture: [docs/architecture.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/architecture.md)
- Stack: [docs/stack.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/stack.md)
- Tools and workflows: [docs/tools.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/tools.md)
- Data contracts: [docs/data-contracts.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/data-contracts.md)
- Upstream references: [docs/upstream-learnings.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/upstream-learnings.md)

Supporting references:
- Agent workflow: [AGENTS.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/AGENTS.md)
- Code structure notes: [docs/code-structure.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/code-structure.md)
- Swift host contract: [docs/swift-host-integration.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/swift-host-integration.md)
- Harness overview: [.agent-harness/README.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.agent-harness/README.md)

## Third-Party Source Discipline

Vendored upstreams:
- `third_party/libghostty/ghostty`
- `third_party/zmx`

Local wrapper package:
- `third_party/libghostty`

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
