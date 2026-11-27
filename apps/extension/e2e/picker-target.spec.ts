import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { chromium } from 'playwright';

test('unpacked extension starts the picker on its tab-bound side-panel target', async () => {
  const extensionPath = resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    const [worker] = context.serviceWorkers();
    const serviceWorker = worker ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(serviceWorker.url()).host;
    const shop = await context.newPage();
    await shop.goto(`chrome-extension://${extensionId}/fixture.html`);
    await shop.bringToFront();
    const shopTab = await serviceWorker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || tab.windowId === undefined) throw new Error('Fixture tab is not active.');
      return { id: tab.id, windowId: tab.windowId, url: chrome.runtime.getURL('fixture.html') };
    });
    await serviceWorker.evaluate(async ({ id, windowId, url }) => {
      await chrome.storage.session.set({
        pickerToolbarContexts: {
          [String(windowId)]: { tabId: id, windowId, url, timestamp: Date.now() },
        },
      });
    }, shopTab);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${shopTab.id}`);
    await expect(panel.getByRole('button', { name: 'Pick from this page' })).toBeVisible();
    await panel.getByRole('button', { name: 'Pick from this page' }).click();
    await expect(shop.locator('[data-virtual-try-on-picker]')).toHaveCount(1);

    await shop.keyboard.press('Escape');
    await expect(shop.locator('[data-virtual-try-on-picker]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
