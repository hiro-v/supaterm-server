# Supaterm Server Agent Harness

This harness is the deterministic feedback loop for iterative implementation.
It runs a fixed set of checks and emits numeric proof plus a JSON artifact.
Checks are phase-aware so you can lock on a single stage without opening
the entire pipeline.

## Run

```bash
bun run ./.agent-harness/run.ts
```

Run a specific phase:

```bash
bun run ./.agent-harness/run.ts --phase phase-1
```

## Outputs

- `.agent-harness/artifacts/latest.json`: JSON report containing per-check timing, exit code, stdout/stderr, and summary counters.

## Policy

- Required checks block progress.
- Optional checks produce warnings and are visible in the report.
- Pass/fail state is deterministic for a fixed environment/state at run time.
- `required: false` checks allow partial progress reporting without blocking.
- `phase` scopes checks to a named gate (for example, `phase-1`).
- `expect.contains` and `maxDurationMs` let checks enforce behavior and latency.

## Extending checks

- Add entries in `.agent-harness/harness.json`.
- Use `"required": false` for signals you want to track before environment/tooling is complete.
