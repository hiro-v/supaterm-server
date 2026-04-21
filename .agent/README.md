# Agent Pack

This folder is the default local agent workspace for this repository.

Use it as the first place to look for repo-specific instructions that do not belong in product docs:
- `skills/zig-server.md`
- `skills/web-ui.md`
- `skills/vendored-deps.md`
- `skills/verification.md`

Toolchain default:
- use `mise` first for local commands in this repo
- run `mise trust mise.toml && mise install` before bootstrap or verification on a fresh machine
- prefer `mise exec -- bun ...` and `mise exec -- zig ...` over assuming system `bun`/`zig`
- prefer the unified `mise run setup`, `mise run dev`, `mise run check`, and `mise run release` tasks when they match the job
- for local Linux parity on macOS, prefer `bun run docker:linux:check` or `bun run docker:linux:test`
- after `bun run hooks:install`, expect both checked-in hooks to be active:
  - `pre-commit` for staged-file scoped checks
  - `pre-push` for the required local critical suite before pushing

The matching `.claude` path is a symlink to this folder so other agent tooling can reuse the same source of truth.
