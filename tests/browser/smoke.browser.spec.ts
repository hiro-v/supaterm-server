import { expect, test } from '@playwright/test';
import {
  openFreshWorkbench,
  readPaneInfo,
  runTerminalCommand,
  terminalCanvasLocator,
} from '../helpers/browser-workbench';

test('browser smoke connects and renders terminal output', async ({ page }) => {
  await openFreshWorkbench(page);
  await expect(page.locator(".pane-status[data-tone='connected']").first()).toContainText('Connected');

  await runTerminalCommand(page, "printf 'SMOKE_RENDER_OK\\n'");
  const infoText = await readPaneInfo(page);
  expect(infoText).toContain('SMOKE_RENDER_OK');
});

test('browser smoke focuses terminal input and sends typed data', async ({ page }) => {
  await page.addInitScript(() => {
    const sent: string[] = [];
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function send(data) {
      try {
        if (typeof data === 'string') {
          sent.push(data);
        }
      } catch {}
      return originalSend.call(this, data);
    };
    (window as typeof window & { __supatermSent?: string[] }).__supatermSent = sent;
  });

  await openFreshWorkbench(page);
  await expect(page.locator(".pane-status[data-tone='connected']").first()).toContainText('Connected');

  await terminalCanvasLocator(page).click();
  await page.waitForTimeout(80);
  await page.keyboard.type('echo BROWSER_SMOKE');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => ({
    activeTag: document.activeElement?.tagName,
    sent: (window as typeof window & { __supatermSent?: string[] }).__supatermSent ?? [],
  }));

  expect(result.activeTag).toBe('TEXTAREA');
  expect(result.sent).toContain('e');
  expect(result.sent).toContain('B');
  expect(result.sent).toContain('\r');
});
