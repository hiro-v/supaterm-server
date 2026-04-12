# Stack

## Server

- Language: Zig
- Build: `zig build`
- Runtime target: Linux first, macOS second
- Packaging direction: single binary with embedded web assets

Why:
- native deploy shape,
- tight control over runtime seams,
- small server dependency surface,
- explicit ownership of sockets, PTY handling, and asset embedding.

## Web

- Language: TypeScript
- Runtime/tooling: Bun
- Bundler: Vite
- Monorepo/task runner: Turborepo
- Lint/type discipline: TypeScript, oxlint-compatible workflow, browser tests
- Terminal engine: local `libghostty` wrapper in `third_party/libghostty`, built from the real `ghostty` submodule at `third_party/libghostty/ghostty`
- Zig linting: `zlint`
- Renderer direction: browser renderer abstraction with future `WebGPU` primary path and `WebGL2` fallback, informed by `restty`

Why:
- fast iteration for the browser client,
- direct source-level control over terminal integration,
- explicit room to grow a richer browser runtime without coupling it to the VT core,
- reproducible build artifact that can be embedded into the Zig binary.

## Persistence and Shared Sessions

- Backend strategy:
  - local PTY backend
  - `zmx` backend from vendored source

Why:
- local backend keeps development and standalone mode simple,
- `zmx` enables named/shared session continuity,
- vendored source plus tracked patches keeps upstream drift explicit.

## Testing

- Zig unit checks
- Bun tests for unit, integration, contract, and e2e layers
- Playwright browser tests
- deterministic agent harness for phased proof

## Future Constraints

- keep the runtime host-agnostic,
- keep transport and share contracts explicit,
- keep browser bundle embeddable into the Zig release artifact.
- evolve the browser side toward a renderer/runtime split instead of allowing terminal, pane, and rendering concerns to collapse into one module.
