# Gap Closure Exec Plan

## Goal

Close the current MVP gaps without undoing the composable repo structure.

The remaining work is grouped so each phase leaves behind:
- clearer module boundaries,
- measurable proof,
- direct tests for each new lego-like part.

## Principles

- keep Zig runtime, HTTP contract, and browser runtime separate
- add seams before features
- avoid legacy compatibility unless it blocks shipping
- every new module gets direct tests
- every performance claim gets a measured proof

## Phase 0: Lock Baseline

Objective:
- freeze the current green baseline before deeper renderer and workbench work

Work:
- capture current CI timings from the last green matrix run
- capture current bundle and WASM sizes
- capture current shell-ready, first-render, and attach timings for 1 pane and 4 panes
- record current module sizes for the main Zig and workbench surfaces

Verification:
- `bun run web:build`
- `bun run test:browser`
- `bun run test:unit`
- `bun run perf:baseline`

Exit criteria:
- baseline is checked in
- measurements are repeatable from a clean checkout
- later phases can compare against explicit numbers

## Phase 1: Renderer and Terminal Fidelity

Objective:
- improve terminal correctness while preserving the current adapter seam

Work:
- formalize the renderer adapter contract in `web/src/runtime/`
- split terminal visuals from transport state in `web/src/terminal-client.ts`
- add a second adapter skeleton for future `webgpu`
- make font and theme configuration explicit
- add browser regressions for `mactop`, `htop`, `claude`, shell prompts, resize, and alternate screen behavior

Exit criteria:
- terminal regressions are covered by browser tests
- renderer path is fully adapter-driven

## Phase 2: Native Workbench Parity

Objective:
- close UI and interaction gaps versus the native Supaterm app

Work:
- split `web/src/workbench.ts` further by responsibility
- improve split, move, focus, and pane resizing behavior
- improve keyboard navigation and hotkey registry structure
- refine sidebar density, pane chrome, and inline icon action treatment
- version persisted workbench schema

Exit criteria:
- no large workbench god-module remains
- workspace, tab, and pane actions are covered by direct tests

## Phase 3: Session Sharing and Auth Hardening

Objective:
- move from MVP sharing to production-safe share semantics

Work:
- formalize host-issued share grants
- separate metadata from access grants completely
- add scoped invite and expiry semantics
- make share issuer ownership explicit for future host embedding

Exit criteria:
- no token leakage through metadata
- all share flows are contract-tested

## Phase 4: Runtime Performance and Scalability

Objective:
- remove obvious browser and Zig runtime bottlenecks

Work:
- centralize browser telemetry and runtime services fully
- keep resize and control traffic deduped and batched
- reduce lock contention and clarify ownership in the Zig session runtime
- benchmark 1, 4, and 8 pane scenarios

Exit criteria:
- measured improvement against the Phase 0 baseline
- no duplicated pane-local polling or hidden runtime work

## Phase 5: Release Hardening

Objective:
- make the repo safe for repeated product and upstream iteration

Work:
- add performance budgets
- deepen vendor patch workflow tests
- enforce submodule and patch discipline in hooks and CI
- document pinned WASM refresh workflow explicitly

Exit criteria:
- CI remains green on macOS and Linux
- structure and performance regressions become visible early

## Current Start Point

Start with Phase 0, then Phase 1, then Phase 2.

That order keeps renderer/runtime seams stable before workbench parity and sharing/auth hardening build on top.
