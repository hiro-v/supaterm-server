# Skill: Web UI

Use this when changing the browser workbench, terminal rendering integration, or keyboard-driven UX.

## Boundaries

- `web/src/main.ts`: app bootstrap only
- `web/src/workbench.ts` plus `web/src/workbench/*`: workbench state, dialogs, sidebar, and pane-tree UI
- `web/src/terminal-client.ts`: `libghosty` wiring, telemetry, terminal theme
- `web/src/session.ts`: URL/session contract helpers
- `web/src/styles.css`: shell styling and layout

## Rules

- Keep workbench state persistent across reloads unless there is a documented reason not to.
- Keep workbench state and persistence in separate modules.
- Avoid leaking raw session IDs in the main pane chrome.
- Keep destructive actions behind confirmation.
- Maintain browser-safe fallback shortcuts when native desktop shortcuts are unavailable.
- Prefer compact, native-feeling sidebar and pane chrome over card-heavy layouts.
- Treat upstream `ghostty-web` as the VT-core reference and `restty` as the browser renderer/runtime reference.
- When adding rendering complexity, preserve a path toward `WebGPU` primary and `WebGL2` fallback instead of baking assumptions into the workbench layer.
- Prefer injected pane-client and persistence seams over direct construction in rendering modules.

## Verification

```bash
bun run web:typecheck
bun run test:unit
bun run test:browser
bun run web:build
```
