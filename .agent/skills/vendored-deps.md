# Skill: Vendored Dependencies

Use this when touching `third_party/libghostty`, `third_party/libghostty/ghostty`, or `third_party/zmx`.

## Rules

- Treat `third_party/libghostty/ghostty` and `third_party/zmx` as the real upstream submodules.
- Treat `third_party/libghostty` as the local wrapper package that follows the upstream `ghostty-web` patch/build layout.
- Record local modifications as tracked git patches in `patches/`.
- Do not replace the patch workflow with ad hoc scripting.

## Commands

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
```

## Verification

- Re-run isolated patch workflow tests when script behavior changes: `bun run test:unit`
- Rebuild browser assets when `libghosty` changes: `bun run web:build`
- Re-run live backend proof when `zmx` changes: `bun run zmx:smoke`
