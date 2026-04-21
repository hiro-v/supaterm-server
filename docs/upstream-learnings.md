# Upstream Learnings

This project borrows from multiple upstreams, but not all of them should be adopted in the same way.

## Current Position

- `ghostty-web` is the current terminal-core reference.
- `restty` is the current browser-runtime and renderer reference.

Use them for different decisions.

## What We Learn From `ghostty-web`

Keep learning from `ghostty-web` for:
- minimal source patching around `libghostty`
- WASM terminal-core integration
- terminal correctness and compatibility
- source-vendoring discipline instead of depending on a published package

This is the right reference for:
- `third_party/libghostty`
- `third_party/libghostty/ghostty`
- `libghosty` patch management
- terminal parser/runtime behavior

## What We Learn From `restty`

Learn from `restty` for:
- `WebGPU`-first rendering with `WebGL2` fallback
- high-level pane/workspace runtime design
- explicit font pipeline and atlas management
- theme parsing and theme application layers
- plugin and extension seams
- better internal documentation for renderer/runtime boundaries

This is the right reference for:
- browser renderer architecture
- future pane/workspace APIs
- font and theme subsystems
- long-term extensibility

## Adopt Now

These ideas should guide current changes:
- keep the browser split between transport, terminal adapter, and workbench UI
- preserve high-level pane/workspace primitives in the web runtime
- keep theme/font/rendering as explicit modules, not hidden inside app bootstrap
- document renderer/runtime seams before adding complexity

## Adopt Later

These are good targets, but not MVP blockers:
- `WebGPU` primary renderer path with `WebGL2` fallback
- richer font-source management and atlas lifecycle control
- plugin hooks for input/output/render lifecycle
- more complete theme compatibility and built-in theme catalog

## Do Not Copy Blindly

Do not adopt these just because they exist upstream:
- a full plugin platform before the core workbench is stable
- a renderer rewrite without a measured need
- a larger browser runtime surface that weakens the current Zig/server ownership model

## Supaterm Direction

The intended direction is:
- Zig owns server runtime, session policy seams, and packaging
- vendored `libghosty` owns terminal-core correctness
- the browser runtime grows toward a `restty`-style architecture:
  - renderer abstraction
  - `WebGPU` support
  - font/theme subsystems
  - pane/workspace runtime APIs

That means:
- do not replace upstream `ghostty-web` learnings with `restty`
- do use `restty` as the architectural reference for the next browser-runtime layer
