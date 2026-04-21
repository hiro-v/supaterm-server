# libghostty Wrapper

This directory is a local wrapper package for Supaterm's browser terminal.

- `ghostty/` is the real upstream Git submodule from `ghostty-org/ghostty`
- `patches/ghostty-wasm-api.patch` is applied transiently during the WASM build
- `lib/` is the TypeScript wrapper surface learned from `ghostty-web`

We learn from `ghostty-web`'s structure and patch discipline, but we do not
vendor the whole `ghostty-web` repository as a submodule.
