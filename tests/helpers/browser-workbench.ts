import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const baseUrl = process.env.SUPATERM_BASE_URL ?? 'http://127.0.0.1:3000';

export function createBrowserSessionId(prefix = 'browser'): string {
  return `${prefix}.${randomUUID()}`;
}

export async function openFreshWorkbench(page: Page, sessionId = createBrowserSessionId()) {
  await page.goto(`${baseUrl}/?session=${encodeURIComponent(sessionId)}`);
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  return sessionId;
}

export async function openConnectedWorkbench(page: Page, sessionId = createBrowserSessionId()) {
  await openFreshWorkbench(page, sessionId);
  await expect(page.locator('.pane-status').first()).toContainText('Connected');
  return sessionId;
}

export async function runTerminalCommand(page: Page, command: string, delay = 10) {
  await page.click('.pane-terminal canvas');
  await page.waitForTimeout(100);
  await page.keyboard.type(command, { delay });
  await page.keyboard.press('Enter');
}

export async function installWebSocketRecorder(page: Page) {
  await page.addInitScript(() => {
    const sent: string[] = [];
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function send(data) {
      try {
        if (typeof data === 'string') {
          sent.push(data);
        }
      } catch {
        // Ignore instrumentation failures in the page context.
      }
      return originalSend.call(this, data);
    };
    (window as typeof window & { __supatermSent?: string[] }).__supatermSent = sent;
  });
}

export async function getSentFrames(page: Page): Promise<string[]> {
  return await page.evaluate(() => (
    (window as typeof window & { __supatermSent?: string[] }).__supatermSent ?? []
  ));
}

export async function readPaneInfo(page: Page) {
  const activePane = page.locator(".pane-card[data-active='true']").first();
  await activePane.getByRole('button', { name: 'Pane details' }).click();
  const panel = page.locator('.info-panel');
  await expect(panel).toBeVisible();
  const text = (await panel.textContent()) ?? '';
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  return text;
}

export async function waitForPaneInfoMatch(
  page: Page,
  predicate: (text: string) => boolean,
  timeoutMs = 2000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() < deadline) {
    lastText = await readPaneInfo(page);
    if (predicate(lastText)) {
      return lastText;
    }
    await page.waitForTimeout(120);
  }
  throw new Error(`Timed out waiting for pane info match. Last text:\n${lastText}`);
}

export function readNumberMetric(text: string, label: string): number {
  const match = text.match(new RegExp(`${label}(\\d+)`));
  if (!match) {
    throw new Error(`Missing metric ${label} in pane info: ${text}`);
  }
  return Number(match[1]);
}

export function readDimensions(text: string): { cols: number; rows: number } {
  const match = text.match(/Dimensions(\d+) × (\d+)/);
  if (!match) {
    throw new Error(`Missing dimensions in pane info: ${text}`);
  }
  return {
    cols: Number(match[1]),
    rows: Number(match[2]),
  };
}
