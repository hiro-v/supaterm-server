import { expect, test } from '@playwright/test';
import {
  getSentFrames,
  installWebSocketRecorder,
  openConnectedWorkbench,
  readDimensions,
  readNumberMetric,
  readPaneInfo,
  runTerminalCommand,
  terminalCanvasLocator,
  waitForPaneInfoMatch,
} from '../helpers/browser-workbench';

test('alternate screen fixtures switch buffers and restore the main screen', async ({ page }) => {
  await openConnectedWorkbench(page);

  await runTerminalCommand(page, "printf 'MAIN_BUFFER_READY\\n'");
  await runTerminalCommand(page, "printf '\\033[?1049h\\033[2J\\033[H'");
  await runTerminalCommand(page, "printf 'ALT_SCREEN_READY\\nCPU 41%%\\nGPU 77%%\\n'");
  const activeText = await waitForPaneInfoMatch(
    page,
    (text) => text.includes('Screen Bufferalternate') && text.includes('ALT_SCREEN_READY'),
  );
  expect(activeText).toContain('Screen Bufferalternate');
  expect(activeText).toContain('ALT_SCREEN_READY');
  expect(activeText).toContain('CPU 41%');
  expect(activeText).toContain('GPU 77%');

  await page.waitForTimeout(600);
  await runTerminalCommand(page, "printf '\\033[?1049l'");
  const restoredText = await waitForPaneInfoMatch(
    page,
    (text) => text.includes('Screen Buffernormal') && text.includes('MAIN_BUFFER_READY'),
    2500,
  );
  expect(restoredText).toContain('Screen Buffernormal');
  expect(restoredText).toContain('MAIN_BUFFER_READY');
});

test('claude-like styled output remains visible in the terminal viewport', async ({ page }) => {
  await openConnectedWorkbench(page);

  const fixtureSource = [
    "import sys",
    "sys.stdout.write('\\x1b[38;2;196;225;119m--- Claude Code v2.1.104 ---\\x1b[0m\\n')",
    "sys.stdout.write('\\x1b[1mWelcome back Hiro!\\x1b[0m\\n')",
    "sys.stdout.write('Tips for getting started\\n')",
    "sys.stdout.write('\\x1b[38;2;134;172;212mRun /init to create a CLAUDE.md\\x1b[0m\\n')",
    "sys.stdout.write('Recent activity\\n')",
    "sys.stdout.write('No recent activity\\n')",
  ].join('\n');
  const fixtureBase64 = Buffer.from(fixtureSource, 'utf8').toString('base64');
  const command = `python3 -c "import base64; exec(base64.b64decode('${fixtureBase64}'))"`;

  await runTerminalCommand(page, command);
  const infoText = await waitForPaneInfoMatch(
    page,
    (text) =>
      text.includes('Claude Code v2.1.104') &&
      text.includes('Welcome back Hiro!') &&
      /Styled Cells\d+/.test(text),
  );
  const normalizedInfoText = infoText.replace(/\s+/g, ' ');
  expect(infoText).toContain('Screen Buffernormal');
  expect(normalizedInfoText).toContain('Claude Code v2.1.104');
  expect(normalizedInfoText).toContain('Welcome back Hiro!');
  expect(infoText).toMatch(/Styled Cells\d+/);

  const styledMatch = infoText.match(/Styled Cells(\d+)/);
  expect(Number(styledMatch?.[1] ?? '0')).toBeGreaterThan(0);
});

test('resize updates dimensions and reflows wrapped terminal content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openConnectedWorkbench(page);

  await runTerminalCommand(
    page,
    "printf 'WRAP_TARGET_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789_abcdefghijklmnopqrstuvwxyz_REPEAT_REPEAT_REPEAT_REPEAT_REPEAT_REPEAT_REPEAT\\n'",
  );
  const wideInfo = await waitForPaneInfoMatch(
    page,
    (text) => text.includes('WRAP_TARGET_') && text.includes('Dimensions'),
  );
  const wideDimensions = readDimensions(wideInfo);
  const wideWrappedRows = readNumberMetric(wideInfo, 'Wrapped Rows');

  await page.setViewportSize({ width: 760, height: 960 });
  await page.waitForTimeout(700);

  const narrowInfo = await readPaneInfo(page);
  const narrowDimensions = readDimensions(narrowInfo);
  const narrowWrappedRows = readNumberMetric(narrowInfo, 'Wrapped Rows');

  expect(narrowDimensions.cols).toBeLessThan(wideDimensions.cols);
  expect(narrowDimensions.rows).toBeGreaterThan(0);
  expect(narrowWrappedRows).toBeGreaterThanOrEqual(wideWrappedRows);
  expect(narrowInfo).toContain('WRAP_TARGET_');
});

test('scrollback navigation changes the visible viewport preview', async ({ page }) => {
  await openConnectedWorkbench(page);

  await runTerminalCommand(
    page,
    "for i in $(seq 1 90); do printf 'SCROLL_%03d\\n' \"$i\"; done",
  );
  const bottomInfo = await waitForPaneInfoMatch(
    page,
    (text) => text.includes('Viewport Y0 rows') && /SCROLL_0(?:5\d|6\d|7\d|8\d|90)/.test(text),
    2500,
  );
  expect(bottomInfo).toContain('Viewport Y0 rows');
  expect(bottomInfo).toMatch(/SCROLL_0(?:5\d|6\d|7\d|8\d|90)/);

  const canvas = terminalCanvasLocator(page);
  await canvas.hover();
  await page.mouse.wheel(0, -3000);
  await page.waitForTimeout(1000);

  const scrolledInfo = await readPaneInfo(page);
  const viewportY = readNumberMetric(scrolledInfo, 'Viewport Y');
  const scrollbackLength = readNumberMetric(scrolledInfo, 'Scrollback');

  expect(scrollbackLength).toBeGreaterThan(0);
  expect(viewportY).toBeGreaterThan(0);
  expect(scrolledInfo).not.toMatch(/SCROLL_0(?:5\d|6\d|7\d|8\d|90)/);
  expect(scrolledInfo).toMatch(/SCROLL_0(?:0[1-9]|[1-4]\d)/);
});

test('bracketed paste mode wraps pasted terminal input', async ({ page }) => {
  await installWebSocketRecorder(page);
  await openConnectedWorkbench(page);

  await runTerminalCommand(page, "printf '\\033[?2004hPASTE_MODE_READY\\n'");
  const infoText = await waitForPaneInfoMatch(
    page,
    (text) => text.includes('Bracketed PasteEnabled'),
  );
  expect(infoText).toContain('Bracketed PasteEnabled');

  await terminalCanvasLocator(page).click();
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const textarea = document.querySelector('.pane-terminal textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error('Missing terminal textarea');
    }

    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      configurable: true,
      value: {
        getData(type: string) {
          return type === 'text/plain' ? 'PASTE_SMOKE' : '';
        },
      },
    });
    textarea.dispatchEvent(event);
  });

  await page.waitForTimeout(150);
  const frames = await getSentFrames(page);
  expect(frames.some((frame) => frame.includes('\u001b[200~PASTE_SMOKE\u001b[201~'))).toBe(true);
});

test('alternate-screen mouse tracking emits SGR mouse sequences', async ({ page }) => {
  await installWebSocketRecorder(page);
  await openConnectedWorkbench(page);

  const command = [
    "printf '\\033[?1049h\\033[2J\\033[H'",
    "printf '\\033[?1000h\\033[?1006h\\033[?1002hMOUSE_TRACK_READY'",
    'sleep 1.2',
  ].join('; ');

  await runTerminalCommand(page, command);
  const infoText = await waitForPaneInfoMatch(
    page,
    (text) =>
      text.includes('Screen Bufferalternate') &&
      text.includes('Mouse TrackingEnabled') &&
      text.includes('SGR MouseEnabled'),
    2500,
  );
  expect(infoText).toContain('Screen Bufferalternate');
  expect(infoText).toContain('Mouse TrackingEnabled');
  expect(infoText).toContain('SGR MouseEnabled');

  const canvas = terminalCanvasLocator(page);
  await canvas.click({ position: { x: 48, y: 36 } });
  await page.waitForTimeout(120);

  const frames = await getSentFrames(page);
  expect(frames.some((frame) => frame.includes('\u001b[<'))).toBe(true);
});

test('wide glyphs emoji underline and inverse video stay visible in the viewport', async ({ page }) => {
  await openConnectedWorkbench(page);

  const command = [
    "printf 'ASCII_READY\\n'",
    "printf '\\033[4mUNDERLINE_READY\\033[0m\\n'",
    "printf '\\033[7mINVERSE_READY\\033[0m\\n'",
    "printf 'WIDE_GLYPH 界🙂 MIX\\n'",
  ].join('; ');

  await runTerminalCommand(page, command);
  const infoText = await waitForPaneInfoMatch(
    page,
    (text) =>
      text.includes('Screen Buffernormal') &&
      text.includes('ASCII_READY') &&
      text.includes('UNDERLINE_READY') &&
      text.includes('INVERSE_READY') &&
      text.includes('WIDE_GLYPH'),
    2500,
  );
  const normalizedInfoText = infoText.replace(/\s+/g, ' ');
  expect(infoText).toContain('Screen Buffernormal');
  expect(normalizedInfoText).toContain('ASCII_READY');
  expect(normalizedInfoText).toContain('UNDERLINE_READY');
  expect(normalizedInfoText).toContain('INVERSE_READY');
  expect(normalizedInfoText).toContain('WIDE_GLYPH 界🙂 MIX');
  expect(infoText).toMatch(/Styled Cells\d+/);

  const styledMatch = infoText.match(/Styled Cells(\d+)/);
  expect(Number(styledMatch?.[1] ?? '0')).toBeGreaterThan(2);
});

test('kitty graphics PNG payloads render into the overlay layer', async ({ page }) => {
  await openConnectedWorkbench(page);

  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAF/gL+0XvV7QAAAABJRU5ErkJggg==';
  await runTerminalCommand(
    page,
    `printf '\\033_Ga=T,f=100,s=1,v=1,c=8,r=4;${pngBase64}\\033\\\\'`,
  );

  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-supaterm-layer="kitty-images-foreground"]');
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    if (getComputedStyle(canvas).display === 'none') return false;
    const context = canvas.getContext('2d');
    if (!context) return false;

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) return true;
    }
    return false;
  });

  const overlay = await page.evaluate(() => {
    const canvas = document.querySelector('[data-supaterm-layer="kitty-images-foreground"]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { found: false, display: 'none', visiblePixels: 0 };
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return { found: true, display: getComputedStyle(canvas).display, visiblePixels: 0 };
    }

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let visiblePixels = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) visiblePixels += 1;
    }

    return {
      found: true,
      display: getComputedStyle(canvas).display,
      visiblePixels,
    };
  });

  expect(overlay.found).toBe(true);
  expect(overlay.display).toBe('block');
  expect(overlay.visiblePixels).toBeGreaterThan(0);
});
