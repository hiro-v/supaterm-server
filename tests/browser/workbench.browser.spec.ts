import { test, expect, type Page } from '@playwright/test';

const baseUrl = process.env.SUPATERM_BASE_URL ?? 'http://127.0.0.1:3000';

async function openFreshWorkbench(page: Page) {
  await page.goto(baseUrl);
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
}

test('workbench manages spaces tabs panes and lean chrome controls', async ({ page }) => {
  await openFreshWorkbench(page);

  await expect(page.locator('.space-pill')).toHaveCount(1);
  await expect(page.locator('.tab-card')).toHaveCount(1);
  await expect(page.locator('.workspace-chip').getByRole('button', { name: 'Rename active space' })).toBeVisible();
  await expect(page.locator('.workspace-chip').getByRole('button', { name: 'Delete active space' })).toBeVisible();

  await page.getByRole('button', { name: 'Add space' }).click();
  await page.locator('.overlay-panel .overlay-input').fill('Working');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.locator('.space-pill')).toHaveCount(2);
  await expect(page.locator('.workspace-chip')).toContainText('Working');

  await page.locator('.space-pill').first().click();
  await expect(page.locator('.workspace-chip')).toContainText('Main');

  await page.locator('.space-pill').nth(1).click();
  await expect(page.locator('.workspace-chip')).toContainText('Working');

  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.locator('.workbench-shell')).toHaveAttribute('data-sidebar-collapsed', 'true');
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.locator('.workbench-shell')).toHaveAttribute('data-sidebar-collapsed', 'false');

  await expect(page.locator('.footer-status')).toContainText('⌘T / ⌥⇧T New tab');
  await expect(page.locator('.footer-status')).toContainText('⌘B / ⌥⇧B Sidebar');

  await page.click('.pane-terminal canvas');
  await page.waitForTimeout(120);

  await page.getByRole('button', { name: 'New Tab' }).click();
  await expect(page.locator('.tab-card')).toHaveCount(2);
  await expect(page.locator('.tab-card-title')).toHaveText(['Tab 1', 'Tab 2']);

  await page.getByRole('button', { name: 'Split down' }).click();
  await expect(page.locator('.pane-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'Open command palette' }).click();
  await expect(page.locator('.palette-panel')).toBeVisible();
  await page.locator('.overlay-panel .overlay-input').fill('rename tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('.dialog-panel')).toBeVisible();
  await page.locator('.overlay-panel .overlay-input').fill('Patch');
  await page.keyboard.press('Enter');

  await expect(page.locator('.tab-card.active')).toContainText('Patch');
  await expect(page.locator('.window-title')).toContainText('Working : Patch');

  const activePane = page.locator(".pane-card[data-active='true']").first();
  await activePane.getByRole('button', { name: 'Rename pane' }).click();
  await page.locator('.overlay-panel .overlay-input').fill('Console');
  await page.keyboard.press('Enter');
  await expect(activePane.locator('.pane-title')).toContainText('Console');

  await expect(activePane.locator('.pane-toolbar')).not.toContainText('ws.');
  await activePane.getByRole('button', { name: 'Pane details' }).click();
  await expect(page.locator('.info-panel')).toContainText('Session');
});

test('reload restores sidebar selection layout and names', async ({ page }) => {
  await openFreshWorkbench(page);

  await page.getByRole('button', { name: 'Add space' }).click();
  await page.locator('.overlay-panel .overlay-input').fill('Persisted');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: 'New Tab' }).click();
  await page.locator('.tab-card.active').getByRole('button', { name: /Rename/ }).click();
  await page.locator('.overlay-panel .overlay-input').fill('Saved Tab');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Split down' }).click();
  const activePane = page.locator(".pane-card[data-active='true']").first();
  await activePane.getByRole('button', { name: 'Rename pane' }).click();
  await page.locator('.overlay-panel .overlay-input').fill('Saved Pane');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.locator('.workbench-shell')).toHaveAttribute('data-sidebar-collapsed', 'true');

  await page.reload();
  await page.waitForTimeout(1500);

  await expect(page.locator('.workbench-shell')).toHaveAttribute('data-sidebar-collapsed', 'true');
  await expect(page.locator('.window-title')).toContainText('Persisted : Saved Tab');
  await expect(page.locator('.pane-card')).toHaveCount(2);
  await expect(page.locator('.pane-title').filter({ hasText: 'Saved Pane' })).toHaveCount(1);
});

test('pane click focuses terminal input and sends typed data', async ({ page }) => {
  await page.addInitScript(() => {
    const sent: string[] = [];
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(data) {
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

  await openFreshWorkbench(page);
  await page.waitForTimeout(3000);

  await page.click('.pane-terminal canvas');
  await page.waitForTimeout(80);
  await page.keyboard.type('echo INPUT_SMOKE');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  const result = await page.evaluate(() => ({
    activeTag: document.activeElement?.tagName,
    sent: (window as typeof window & { __supatermSent?: string[] }).__supatermSent ?? [],
  }));

  expect(result.activeTag).toBe('TEXTAREA');
  expect(result.sent).toContain('e');
  expect(result.sent).toContain('I');
  expect(result.sent).toContain('\r');
});
