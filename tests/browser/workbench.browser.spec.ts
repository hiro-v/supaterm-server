import { test, expect } from '@playwright/test';
import {
  createBrowserSessionId,
  openFreshWorkbench,
  readPaneInfo,
  runTerminalCommand,
  terminalCanvasLocator,
} from '../helpers/browser-workbench';

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

  await terminalCanvasLocator(page).click();
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
  await expect(page.locator('.info-panel')).toContainText('supaterm.blackout');
  await expect(page.locator('.info-panel')).toContainText('supaterm.theme.blackout');
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
  await runTerminalCommand(page, "printf 'RELOAD_HYDRATION_OK\\n'");
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.locator('.workbench-shell')).toHaveAttribute('data-sidebar-collapsed', 'true');

  await page.reload();
  await page.waitForTimeout(1500);

  await expect(page.locator('.workbench-shell')).toHaveAttribute('data-sidebar-collapsed', 'true');
  await expect(page.locator('.window-title')).toContainText('Persisted : Saved Tab');
  await expect(page.locator('.pane-card')).toHaveCount(2);
  await expect(page.locator('.pane-title').filter({ hasText: 'Saved Pane' })).toHaveCount(1);

  const infoText = await readPaneInfo(page);
  expect(infoText).toContain('Session ReusedEnabled');
  expect(infoText).toContain('First Backend Read');
});

test('pane reconnects after websocket close and reuses the same session', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    const sockets: WebSocket[] = [];
    class InstrumentedWebSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    }
    window.WebSocket = InstrumentedWebSocket as typeof WebSocket;
    (window as typeof window & { __supatermSockets?: WebSocket[] }).__supatermSockets = sockets;
  });

  await openFreshWorkbench(page);
  await expect(page.locator(".pane-status[data-tone='connected']").first()).toContainText('Connected');

  await page.evaluate(() => {
    const sockets = (window as typeof window & { __supatermSockets?: WebSocket[] }).__supatermSockets ?? [];
    sockets[0]?.close();
  });

  await expect(page.locator(".pane-status[data-tone='connected']").first()).toContainText('Connected');
  await runTerminalCommand(page, "printf 'RECONNECT_OK\\n'");
  await page.waitForTimeout(250);
  const infoText = await readPaneInfo(page);
  expect(infoText).toContain('RECONNECT_OK');
});

test('fresh browser restores the shared workbench snapshot from the server', async ({ browser, page }) => {
  const sessionId = createBrowserSessionId('shared-workbench');
  await openFreshWorkbench(page, sessionId);

  await page.getByRole('button', { name: 'Add space' }).click();
  await page.locator('.overlay-panel .overlay-input').fill('Shared');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: 'New Tab' }).click();
  await page.locator('.tab-card.active').getByRole('button', { name: /Rename/ }).click();
  await page.locator('.overlay-panel .overlay-input').fill('Review');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Split down' }).click();
  await page.locator(".pane-card[data-active='true']").first().getByRole('button', { name: 'Rename pane' }).click();
  await page.locator('.overlay-panel .overlay-input').fill('Shared Pane');
  await page.keyboard.press('Enter');

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await openFreshWorkbench(secondPage, sessionId);
    await expect(secondPage.locator('.window-title')).toContainText('Shared : Review', { timeout: 3000 });
    await expect(secondPage.locator('.pane-card')).toHaveCount(2);
    await expect(secondPage.locator('.pane-title').filter({ hasText: 'Shared Pane' })).toHaveCount(1);

    const infoText = await readPaneInfo(secondPage);
    expect(infoText).toContain('Session ReusedEnabled');
    expect(infoText).toContain('First Backend Read');
  } finally {
    await secondContext.close();
  }
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

  await terminalCanvasLocator(page).click();
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

test('pane details exposes shell choices and changing shell switches the pane session identity', async ({ page }) => {
  await openFreshWorkbench(page);
  await expect(page.locator(".pane-status[data-tone='connected']").first()).toContainText('Connected');

  const activePane = page.locator(".pane-card[data-active='true']").first();
  await activePane.getByRole('button', { name: 'Pane details' }).click();
  const panel = page.locator('.info-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('select[data-action="pane-shell"]')).toBeVisible();
  await expect(panel.locator('select[data-action="pane-shell"] option')).toHaveCount(5);

  await panel.locator('select[data-action="pane-shell"]').selectOption('sh');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".pane-status[data-tone='connected']").first()).toContainText('Connected');

  const infoText = await readPaneInfo(page);
  expect(infoText).toContain('Shellsh');
  expect(infoText).toContain('.shell.sh');
});

test('appearance changes persist through reload and shared workbench restore', async ({ browser, page }) => {
  const sessionId = createBrowserSessionId('appearance');
  await openFreshWorkbench(page, sessionId);

  await page.getByRole('button', { name: 'Open appearance settings' }).click();
  const panel = page.locator('.appearance-panel');
  await expect(panel).toBeVisible();
  await panel.locator('select[data-appearance-field="fontPreset"]').selectOption('jetbrains');
  await panel.locator('input[data-appearance-field="fontSize"]').fill('17');
  await panel.locator('input[data-appearance-field="theme.background"]').fill('#111111');
  await panel.locator('input[data-appearance-field="theme.foreground"]').fill('#f5f5f5');
  await panel.getByRole('button', { name: 'Apply' }).click();

  await page.reload();
  await expect(page.locator('.pane-status').first()).toContainText('Connected');
  let infoText = await readPaneInfo(page);
  expect(infoText).toContain('supaterm.theme.custom');

  const styles = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement;
    const css = getComputedStyle(root);
    return {
      bg: css.getPropertyValue('--chrome-shell-bg').trim(),
      text: css.getPropertyValue('--text').trim(),
    };
  });
  expect(styles.bg).toBe('#000000');
  expect(styles.text).toBe('#f5f5f5');

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await openFreshWorkbench(secondPage, sessionId);
    await expect(secondPage.locator('.pane-status').first()).toContainText('Connected');
    infoText = await readPaneInfo(secondPage);
    expect(infoText).toContain('supaterm.theme.custom');
  } finally {
    await secondContext.close();
  }
});

test('pane details modal closes from close button and outside click', async ({ page }) => {
  await openFreshWorkbench(page);
  await page.waitForFunction(() => document.querySelector('.pane-status')?.textContent?.includes('Connected'));

  const activePane = page.locator(".pane-card[data-active='true']").first();
  await activePane.getByRole('button', { name: 'Pane details' }).click();
  await expect(page.locator('.info-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('.info-panel')).toHaveCount(0);

  await activePane.getByRole('button', { name: 'Pane details' }).click();
  await expect(page.locator('.info-panel')).toBeVisible();
  await page.locator('.overlay-scrim').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.info-panel')).toHaveCount(0);
});
