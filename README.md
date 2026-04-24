# supaterm-server

Zig terminal server with a Bun/TypeScript web client. It serves browser shells over WebSocket, supports local PTY and `zmx` backends, and keeps the runtime split cleanly between Zig server logic and browser session/workbench code.

## Setup

Requirements:
- Zig `0.15.x`
- Bun `1.3.x`
- Git with submodule support
- `zlint` via `PATH`, `ZLINT_BIN`, or a local GHQ checkout of `github.com/DonIsaac/zlint`

Preferred bootstrap:
```bash
make setup
```

Direct `mise` path:
```bash
mise trust mise.toml
mise install
mise run setup
```

## Daily

Run the server:
```bash
make dev
```

Common commands:
```bash
make check
make release
make unit
make browser
make web-build
```

Direct binary examples:
```bash
./zig-out/bin/supaterm-server --help
./zig-out/bin/supaterm-server --listen 0.0.0.0:3000
./zig-out/bin/supaterm-server --backend zmx --zmx-socket-dir /tmp/zmx-501
```

## Verification

Fast paths:
```bash
make check
mise exec -- bun run test:browser
mise exec -- bun run harness
```

Local Linux parity:
```bash
bun run docker:linux:setup
bun run docker:linux:check
bun run docker:linux:test
```

## Release

- `tip`: prerelease channel from `main`
- `nightly`: `nightly-YYYY-MM-DD` prerelease with GitHub-generated notes
- `prod`: `vX.Y.Z` release with GitHub-generated notes

See:
- [docs/tools.md](docs/tools.md)
- [.github/workflows/release-tip.yml](.github/workflows/release-tip.yml)
- [.github/workflows/release-nightly.yml](.github/workflows/release-nightly.yml)
- [.github/workflows/release-prod.yml](.github/workflows/release-prod.yml)

## Docs

Start here:
- [docs/architecture.md](docs/architecture.md)
- [docs/data-contracts.md](docs/data-contracts.md)
- [docs/tools.md](docs/tools.md)
- [docs/upstream-learnings.md](docs/upstream-learnings.md)

Supporting refs:
- [docs/stack.md](docs/stack.md)
- [docs/code-structure.md](docs/code-structure.md)
- [docs/terminal-fidelity.md](docs/terminal-fidelity.md)
- [docs/performance-baseline.md](docs/performance-baseline.md)
- [docs/swift-host-integration.md](docs/swift-host-integration.md)
- [AGENTS.md](AGENTS.md)

## Design Rules

- keep modules small and self-contained
- prefer injected seams over hidden globals
- test each composable part directly
- treat hooks, workflow configs, and vendor patch scripts as testable components
- avoid leaking transport, persistence, or renderer details across module boundaries
