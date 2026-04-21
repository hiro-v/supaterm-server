# Skill: Vendored Dependencies

Use this when touching `third_party/libghostty`, `third_party/libghostty/ghostty`, or `third_party/zmx`.

## Rules

- Treat `third_party/libghostty/ghostty` and `third_party/zmx` as the real upstream submodules.
- Treat `third_party/libghostty` as the local wrapper package that follows the upstream `ghostty-web` patch/build layout.
- Record upstream submodule modifications as tracked git patches in `patches/`.
- Commit wrapper files under `third_party/libghostty/` directly in the main repo; do not try to encode wrapper edits into the upstream patch file.
- Do not replace the patch workflow with ad hoc scripting.
- After regenerating an upstream patch, reset/clean the submodule and rely on `apply` to restore it. Do not leave long-lived dirty submodule state around.

## Commands

`libghosty`:
```bash
bun run libghosty:patch
bun run libghosty:apply
bun run libghosty:sync --ref <ref>
```

Recommended `libghosty` edit flow:
```bash
# 1. Edit upstream files inside the submodule.
git -C third_party/libghostty/ghostty status --short

# 2. Regenerate the tracked upstream patch from the submodule diff.
bun run libghosty:patch

# 3. Review the patch itself before committing it.
git diff -- patches/libghosty/libghosty.patch

# 4. Reset the submodule and reapply from the tracked patch.
git -C third_party/libghostty/ghostty reset --hard
git -C third_party/libghostty/ghostty clean -fd
bun run libghosty:apply
```

`zmx`:
```bash
bun run zmx:patch
bun run zmx:apply
bun run zmx:sync --ref <ref>
```

Recommended `zmx` edit flow:
```bash
git -C third_party/zmx status --short
bun run zmx:patch
git diff -- patches/zmx/zmx.patch
git -C third_party/zmx reset --hard
git -C third_party/zmx clean -fd
bun run zmx:apply
```

## Verification

- Re-run isolated patch workflow tests when script behavior changes: `bun run test:unit`
- Rebuild browser assets when `libghosty` changes: `bun run web:build`
- Re-run live backend proof when `zmx` changes: `bun run zmx:smoke`
- Before push, verify that submodule dirtiness matches intentional, reproducible patch application:
  - `git -C third_party/libghostty/ghostty status --short`
  - `git -C third_party/zmx status --short`
