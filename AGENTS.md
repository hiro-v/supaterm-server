# AGENTS.md

Use this repository as a Zig-first terminal server with a Bun/TypeScript web client. Optimize for small, defensible changes and keep runtime seams explicit.

## Start Here

Read in this order:
1. [README.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/README.md)
2. [docs/architecture.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/architecture.md)
3. [docs/data-contracts.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/data-contracts.md)
4. [docs/tools.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/tools.md)
5. [docs/upstream-learnings.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/docs/upstream-learnings.md)

Then use the local skill pack under `.agent/skills/`.

## Repo Rules

- Keep Zig runtime logic in `src/session_manager.zig` or `src/session_backends.zig`.
- Keep HTTP parsing and payload shaping in `src/session_http.zig`.
- Keep `src/main.zig` as orchestration, not a business-logic sink.
- Keep browser startup thin in `web/src/main.ts`.
- Keep terminal integration in `web/src/terminal-client.ts`.
- Keep browser transport and session URL rules in `web/src/session.ts`.
- Keep workbench state pure and separate from persistence.
- Prefer injected seams for persistence, pane clients, and session resolution.
- Use upstream `ghostty-web` as the terminal-core reference and `restty` as the browser-runtime reference.
- Do not hand-edit vendored upstreams without regenerating tracked patches.
- Prefer additive docs and explicit contracts over hidden assumptions.
- Treat checked-in hooks and GitHub workflows as testable repo components, not ad hoc automation.

## Change Discipline

- For the local `third_party/libghostty` wrapper and its `third_party/libghostty/ghostty` upstream, regenerate and apply changes through:
  - `bun run libghosty:patch`
  - `bun run libghosty:sync --ref <ref>`
- For `third_party/zmx`, regenerate and apply changes through:
  - `bun run zmx:patch`
  - `bun run zmx:sync --ref <ref>`

## Verification

Run the smallest proof that matches the change:
- Repo tooling, hooks, or workflow config: `bun run test:unit`
- Zig-only: `zig build check`
- Browser UI: `bun run web:typecheck && bun run test:browser`
- Workbench/component modules: `bun run test:unit`
- Session/runtime/API: `bun run test:integration && bun run test:contract`
- Backend/share flow: `bun run test:e2e` or `bun run zmx:smoke`
- Full repo proof: `bun run harness`
- Zig lint: `bun run zig:lint`
  This resolves through `PATH`, `ZLINT_BIN`, or the local GHQ clone of `github.com/DonIsaac/zlint`.

## Skills

Default local skills live in:
- [.agent/README.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.agent/README.md)
- [.agent/skills/zig-server.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.agent/skills/zig-server.md)
- [.agent/skills/web-ui.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.agent/skills/web-ui.md)
- [.agent/skills/vendored-deps.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.agent/skills/vendored-deps.md)
- [.agent/skills/verification.md](/Users/hiro/Library/Developer/ghq/github.com/hiro-v/supaterm-server/.agent/skills/verification.md)
