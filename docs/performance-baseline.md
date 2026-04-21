# Performance Baseline

This document captures the current MVP baseline before the next renderer, workbench, and auth hardening phases.

Source of truth:
- generated report: `.agent-harness/artifacts/perf-baseline.json`
- collector: `scripts/perf-baseline.ts`
- CI base baseline: `.agent-harness/artifacts/perf-baseline.base.json`
- current-run report: `.agent-harness/artifacts/perf-current.json`
- budget report: `.agent-harness/artifacts/perf-check.json`

Run:
```bash
bun run perf:baseline
bun run perf:current
```

Metrics captured:
- last known green CI matrix job durations
- current browser bundle sizes
- pinned `libghostty` WASM size
- shell-ready latency
- startup marks for:
  - bootstrap started
  - workbench mounted
  - renderer ready
  - websocket open
  - first terminal bytes
  - first pane connected
- first terminal canvas latency
- first pane connected latency
- four-pane layout latency
- four-pane connected latency
- p50 and p95 browser runtime aggregates for current latency metrics
- renderer metrics for active terminal scenes:
  - atlas entry count
  - atlas dimensions
  - active glyph quad count
  - active rect instance count
  - per-frame upload bytes
  - per-frame CPU time and rolling average
- current line counts for the largest Zig and workbench modules

Regression check:
```bash
bun run perf:check
```

`perf:check` compares the current 1-pane and 4-pane measurements against the baseline p95 latencies and against same-run single-pane renderer metrics, then writes the collected current run to `.agent-harness/artifacts/perf-current.json` and the comparison report to `.agent-harness/artifacts/perf-check.json`. That report now also carries current-vs-baseline deltas for the main latency and renderer metrics so CI summaries can show whether a PR improved or regressed the active baseline. In CI, the perf job first tries to resolve `.agent-harness/artifacts/perf-baseline.base.json` from the PR base branch so the budget check compares against the branch you are merging into instead of only the current branch state. Renderer-specific checks are skipped automatically when the active browser runtime does not expose WebGPU adapter metrics.

The numbers below should be updated when the collector is rerun as part of a deliberate baseline refresh.

## Current Baseline

Measured at:
- timestamp: `2026-04-20T12:28:37.337Z`
- commit: `786971dc623cf7e24ad340b4eadd9806885593be`
- report: `.agent-harness/artifacts/perf-baseline.json`

Historical CI job durations from the older full matrix snapshot captured with this baseline:
- `core (macos-latest)`: `158s`
- `browser (macos-latest)`: `129s`
- `core (ubuntu-latest)`: `197s`
- `browser (ubuntu-latest)`: `81s`

Current workflow shape is different:
- required PR gate: `pr_status`
- critical parallel jobs: `quality (ubuntu-latest)` and `build (macos-latest)`
- browser coverage: non-blocking `browser-smoke`

Build artifacts:
- pinned `third_party/libghostty/ghostty-vt.wasm`: `423,910 bytes`
- emitted `ghostty-vt` browser asset: `423,910 bytes`
- emitted main JS asset: `177,031 bytes`
- emitted main CSS asset: `12,024 bytes`
- emitted main JS sourcemap: `611,994 bytes`

Browser runtime averages from 1 sample:
- shell-ready latency: `70.79ms`
- first terminal canvas latency: `76.36ms`
- first pane connected latency: `81.39ms`
- four-pane layout latency: `116.64ms`
- four-pane connected latency: `164.70ms`
- workbench mounted: `15.60ms`
- renderer ready: `33.60ms`
- websocket open: `72.20ms`
- first terminal bytes: `79.20ms`
- first pane connected mark: `72.30ms`
- server session age: `4ms`
- server output pump started: `0ms`
- server first backend read: `4ms`
- server first broadcast: `4ms`
- renderer atlas entries: `54`
- renderer atlas size: `1024 × 1024`
- renderer active glyph quads: `230`
- renderer active rect instances: `27`
- renderer upload bytes: `0`
- renderer frame CPU: `0.20ms`
- renderer frame CPU average: `0.26ms`

Browser runtime percentiles from 1 sample:
- p50 shell-ready latency: `70.79ms`
- p95 shell-ready latency: `70.79ms`
- p50 four-pane layout latency: `116.64ms`
- p95 four-pane layout latency: `116.64ms`
- p50 four-pane connected latency: `164.70ms`
- p95 four-pane connected latency: `164.70ms`

Current large-module line counts:
- `src/main.zig`: `720`
- `src/session_manager.zig`: `740`
- `src/session_backends.zig`: `707`
- `src/session_http.zig`: `238`
- `web/src/workbench.ts`: `596`
- `web/src/workbench/state.ts`: `152`
- `web/src/workbench/commands.ts`: `146`
- `web/src/workbench/overlay.ts`: `241`
- `web/src/workbench/panes.ts`: `163`
- `web/src/workbench/sidebar.ts`: `78`
- `web/src/workbench/persistence.ts`: `62`

## Immediate Implications

- the server-side attach path is no longer the main latency bottleneck for local PTYs; first backend read and first broadcast now happen at about `4ms`
- the main remaining browser structure hotspot is still `web/src/workbench.ts`, but it is materially smaller than the earlier baseline
- the main remaining Zig structure hotspots are `src/main.zig`, `src/session_backends.zig`, and `src/session_manager.zig`
- the next performance work should target browser connect/render variance and GPU upload behavior, not shell startup
