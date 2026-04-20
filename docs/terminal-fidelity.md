# Terminal Fidelity

## Goal

Keep browser terminal behavior measurable before deeper renderer work lands.

The current fidelity baseline is not screenshot-first. It is based on terminal
state observed through the active renderer buffer:
- active screen buffer (`normal` vs `alternate`)
- visible viewport text preview
- presence of styled cells in the viewport

The current WebGPU terminal path is buffer-driven:
- `libghostty` remains the VT/input/buffer engine
- the visible WebGPU frame is synthesized from buffer cells through a dedicated rasterizer
- repeated glyphs are cached through a glyph atlas that can grow before resetting
- glyph atlas reset count is tracked explicitly so max-size eviction events are visible in diagnostics
- glyphs are drawn through GPU-instanced quads instead of a CPU final text surface
- background and overlay decoration layers are drawn through GPU rect instances
- CPU rendering is now limited to scene construction and glyph-atlas preparation
- rect and glyph instance payloads are reused across frames instead of being rebuilt from fresh typed arrays each frame
- rect and glyph GPU instance buffers retain grown capacity instead of reallocating to exact byte counts for larger scenes
- steady-state rect and glyph instance uploads are now skipped when the payload is unchanged, so perf diagnostics can expose true zero-upload frames
- fallback remains the direct `libghostty` canvas renderer when WebGPU is unavailable or initialization fails

## Current Browser Regressions

The browser suite covers two stable fidelity cases:

- alternate-screen lifecycle
  - enter `1049` alternate screen
  - render fullscreen-style content
  - exit back to the normal buffer
  - verify the normal buffer is restored

- Claude-style styled output
  - render a multi-line structured screen with ANSI styling
  - verify visible text remains present in the viewport
  - verify non-default styled cells are detected

- resize and reflow
  - resize the browser viewport
  - verify terminal dimensions change
  - verify wrapped-row count does not regress

- scrollback vs visible viewport
  - generate enough output to create scrollback
  - verify bottom-of-buffer viewport state
  - scroll upward and verify the visible preview changes to older lines

- bracketed paste
  - enable DEC mode `2004`
  - dispatch a real paste event through the terminal textarea
  - verify the outbound data is wrapped with bracketed paste markers

- alternate-screen mouse reporting
  - enter alternate screen
  - enable mouse tracking and SGR mouse mode
  - dispatch a real pointer interaction on the terminal canvas
  - verify SGR mouse bytes are emitted

- explicit cursor placement
  - place the cursor with an absolute CSI position sequence
  - verify cursor coordinates and visibility through pane diagnostics

## Pass Criteria

For alternate-screen fixtures:
- pane diagnostics report `alternate` while the fixture is active
- viewport preview shows the alternate-screen content
- pane diagnostics return to `normal` after exit
- normal-screen content from before the switch is visible again

For styled-output fixtures:
- pane diagnostics remain on the normal buffer
- viewport preview contains the expected headings/body lines
- styled cell count is greater than zero

For resize fixtures:
- dimensions change after viewport resize
- wrapped row count increases or stays higher under the narrower layout
- target wrapped content remains visible in the viewport preview

For scrollback fixtures:
- scrollback length is greater than zero
- viewport Y is zero at the live bottom
- viewport Y increases after scroll-up input
- viewport preview changes away from the newest lines

For bracketed paste fixtures:
- pane diagnostics report bracketed paste as enabled
- pasted text is sent through the WebSocket wrapped in `ESC[200~` and `ESC[201~`

For alternate-screen mouse fixtures:
- pane diagnostics report alternate screen, mouse tracking, and SGR mouse mode as enabled
- outbound WebSocket frames contain SGR mouse sequences (`ESC[<`)

For cursor placement fixtures:
- pane diagnostics report the expected cursor row and column
- cursor visibility remains enabled
- viewport preview contains the positioned marker text

## Why This Baseline

This keeps the fidelity contract above pixel snapshots:
- robust across macOS and Linux CI
- tied to renderer-visible terminal state
- useful during the future WebGPU terminal renderer transition

## Future Expansion

Next fidelity checks should cover:
- cursor style changes
- focus event reporting over the session transport
- TUI-specific regressions for `mactop`, `htop`, and Claude/Codex sessions
- explicit viewport checks for wide glyphs, emoji, underline, and inverse-video heavy screens
