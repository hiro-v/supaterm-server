# Tools

## Core Commands

Bootstrap:
```bash
git submodule update --init --recursive
bun install
bun run hooks:install
```

Server:
```bash
zig build
zig build run
zig build check
```

Web:
```bash
bun run web:typecheck
bun run web:lint
bun run web:build
```

Tests:
```bash
bun run test:unit
bun run test:integration
bun run test:contract
bun run test:e2e
bun run test:browser
```

Component-focused coverage in `test:unit` now includes:
- workbench state transforms
- workbench command generation
- workbench persistence
- workbench sidebar rendering
- workbench overlay rendering
- workbench pane-tree rendering through injected pane clients
- vendor patch workflow scripts for `libghosty` and `zmx`

Proof:
```bash
bun run harness
```

Local hooks:
```bash
bun run hooks:install
bun run hooks:pre-commit
```

The checked-in hook entrypoint is [.git-hooks/pre-commit](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.git-hooks/pre-commit), and the staging planner lives in [scripts/pre-commit.ts](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/scripts/pre-commit.ts).

Zig lint:
```bash
bun run zig:lint
```

`bun run zig:lint` uses [scripts/zlint.sh](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/scripts/zlint.sh), which prefers:
- `ZLINT_BIN`
- `zlint` on `PATH`
- a local GHQ checkout of `github.com/DonIsaac/zlint`

## Vendored Dependency Workflows

`libghosty`:
```bash
bun run libghosty:patch
bun run libghosty:apply
bun run libghosty:sync --ref <ref>
```

`zmx`:
```bash
bun run zmx:patch
bun run zmx:apply
bun run zmx:sync --ref <ref>
bun run zmx:smoke
```

The repo-level `web:*`, `test:e2e`, and `zmx:smoke` scripts auto-apply the tracked vendor patches first so a clean checkout remains reproducible.

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
2. `zig build check`
3. run integration/contract tests if APIs changed

Web-only:
1. edit
2. `bun run web:typecheck`
3. `bun run test:browser`
4. `bun run web:build`

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
- test matrix: [.github/workflows/test.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/workflows/test.yml)
- tip channel updater: [.github/workflows/release-tip.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/workflows/release-tip.yml)
- shared cache/bootstrap action: [.github/actions/setup-ci/action.yml](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.github/actions/setup-ci/action.yml)

Current CI policy:
- run Linux and macOS first
- restore Bun, Zig, build, and Playwright caches through the shared setup action
- checkout submodules recursively so vendored `ghostty` and `zmx` source are present before any build/test step
- keep the `tip` prerelease channel aligned with `main` by force-moving the `tip` tag and refreshing the GitHub prerelease assets

## Git Discipline

- use conventional commits,
- keep vendor changes and local app changes logically grouped,
- prefer branch-local cleanup before opening a PR,
- do not leave generated browser reports or temporary artifacts tracked.
