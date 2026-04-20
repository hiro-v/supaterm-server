import { expect, test } from '@playwright/test';
import { openConnectedWorkbench, readNumberMetric, readPaneInfo, runTerminalCommand } from '../helpers/browser-workbench';

test('pane churn stabilizes renderer metrics after repeated split and close cycles', async ({ page }) => {
  await openConnectedWorkbench(page);

  for (let index = 0; index < 3; index += 1) {
    const activePane = page.locator(".pane-card[data-active='true']").first();
    await activePane.getByRole('button', { name: 'Split down' }).click();
    await expect(page.locator('.pane-card')).toHaveCount(index + 2);
  }

  await runTerminalCommand(page, "printf 'CHURN_READY\\n'");
  await page.waitForTimeout(250);

  let infoText = await readPaneInfo(page);
  const canvasFallback = infoText.includes('Renderer MetricsCanvas Fallback');
  const expandedRectBuffer = canvasFallback ? null : readNumberMetric(infoText, 'Rect Buffer');
  const expandedGlyphBuffer = canvasFallback ? null : readNumberMetric(infoText, 'Glyph Buffer');
  if (canvasFallback) {
    expect(infoText).toContain('Metrics NoteWebGPU renderer metrics unavailable on canvas fallback.');
    expect(infoText).toContain('Atlas Resets-- times');
    expect(infoText).toContain('Rect Buffer-- bytes');
    expect(infoText).toContain('Glyph Buffer-- bytes');
  } else {
    expect(readNumberMetric(infoText, 'Atlas Resets')).toBe(0);
  }

  for (let index = 0; index < 3; index += 1) {
    const activePane = page.locator(".pane-card[data-active='true']").first();
    await activePane.getByRole('button', { name: 'Close pane' }).click();
    await page.locator('.confirm-panel').getByRole('button', { name: 'Close Pane' }).click();
    await expect(page.locator('.pane-card')).toHaveCount(3 - index);
  }

  await page.waitForTimeout(350);
  infoText = await readPaneInfo(page);
  expect(infoText).toContain('Screen Buffernormal');
  if (canvasFallback) {
    expect(infoText).toContain('Renderer MetricsCanvas Fallback');
    expect(infoText).toContain('Metrics NoteWebGPU renderer metrics unavailable on canvas fallback.');
    expect(infoText).toContain('Upload-- bytes');
    expect(infoText).toContain('Rect Buffer-- bytes');
    expect(infoText).toContain('Glyph Buffer-- bytes');
  } else {
    expect(readNumberMetric(infoText, 'Atlas Resets')).toBe(0);
    expect(readNumberMetric(infoText, 'Upload')).toBe(0);
    expect(readNumberMetric(infoText, 'Rect Buffer')).toBe(expandedRectBuffer);
    expect(readNumberMetric(infoText, 'Glyph Buffer')).toBe(expandedGlyphBuffer);
  }
});
