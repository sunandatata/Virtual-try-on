import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { chromium } from 'playwright';

test('unpacked extension exercises the fixture and narrow side-panel states', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const extensionPath = resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    const [worker] = context.serviceWorkers();
    const serviceWorker = worker ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(serviceWorker.url()).host;

    const fixture = await context.newPage();
    await fixture.goto(`chrome-extension://${extensionId}/fixture.html`);
    await expect(fixture.locator('#dress-product')).toBeVisible();

    const panelHarness = await context.newPage();
    await panelHarness.setViewportSize({ width: 360, height: 800 });
    await panelHarness.emulateMedia({ reducedMotion: 'reduce' });
    await panelHarness.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(panelHarness.getByRole('heading', { name: 'Virtual Try-On' })).toBeVisible();
    await panelHarness.getByRole('button', { name: 'Try on' }).click();
    await expect(panelHarness.getByText('Add your body photo')).toBeVisible();
    await panelHarness.screenshot({ path: testInfo.outputPath('first-run.png'), fullPage: true });

    await panelHarness
      .getByLabel('Add your body photo')
      .setInputFiles(resolve('public/fixture/person.png'));
    await panelHarness
      .getByRole('checkbox')
      .evaluate((checkbox: HTMLInputElement) => checkbox.click());
    await expect(panelHarness.getByRole('heading', { name: 'Choose a garment' })).toBeVisible();

    await fixture.bringToFront();
    await serviceWorker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('Fixture tab is not active.');
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PICKER' });
    });
    const dress = fixture.locator('#dress-product');
    await dress.hover();
    await expect(fixture.locator('[data-virtual-try-on-picker]')).toHaveCount(1);
    await fixture.screenshot({ path: testInfo.outputPath('picker.png'), fullPage: true });
    await fixture.keyboard.press('Escape');
    await expect(fixture.locator('[data-virtual-try-on-picker]')).toHaveCount(0);

    await panelHarness.bringToFront();
    await panelHarness.getByRole('button', { name: 'Try on' }).click();
    await panelHarness
      .getByLabel('Upload garment screenshot')
      .setInputFiles(resolve('public/fixture/dress.png'));
    await expect(
      panelHarness.getByRole('heading', { name: 'Confirm garment details' }),
    ).toBeVisible();
    await panelHarness.getByRole('button', { name: 'Try on' }).click();
    await expect(panelHarness.getByAltText('Upload garment screenshot preview')).toBeVisible();
    await panelHarness.screenshot({
      path: testInfo.outputPath('ready-with-garment.png'),
      fullPage: true,
    });

    const demoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960"><rect width="720" height="960" fill="#eadfd2"/><circle cx="360" cy="220" r="90" fill="#dbaf99"/><path d="M220 860V470c0-120 280-120 280 0v390z" fill="#704457"/><text x="360" y="920" text-anchor="middle" font-family="sans-serif" font-size="34">DEMO RESULT</text></svg>`;
    const demoResult = `data:image/svg+xml;base64,${Buffer.from(demoSvg).toString('base64')}`;
    let polls = 0;
    await context.route('http://localhost:3000/api/try-on', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          ok: true,
          jobToken: 'e2e-signed-job-token',
          status: 'processing',
          provider: 'mock',
        }),
      });
    });
    await context.route('http://localhost:3000/api/try-on/status?*', async (route) => {
      polls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(
          polls === 1
            ? { ok: true, status: 'processing' }
            : { ok: true, status: 'succeeded', resultUrl: demoResult, isDemo: true },
        ),
      });
    });
    await panelHarness.evaluate(() => {
      Object.defineProperty(chrome.permissions, 'request', {
        configurable: true,
        value: async () => true,
      });
    });
    await panelHarness.getByRole('button', { name: 'Generate try-on' }).click();
    await expect(panelHarness.getByText(/Creating your preview/)).toBeVisible();
    await panelHarness.screenshot({ path: testInfo.outputPath('processing.png'), fullPage: true });
    await expect(panelHarness.getByRole('heading', { name: 'Demo result' })).toBeVisible();
    await expect(panelHarness.getByText('DEMO · NOT AI')).toBeVisible();
    await expect(panelHarness.getByRole('link', { name: 'Download result' })).toHaveAttribute(
      'download',
    );
    await panelHarness.screenshot({ path: testInfo.outputPath('result.png'), fullPage: true });

    await panelHarness.evaluate(async () => {
      await chrome.storage.local.set({
        generation: {
          status: 'failed',
          message: 'The demo service could not create this preview.',
        },
      });
    });
    await panelHarness.reload();
    await panelHarness.getByRole('button', { name: 'Try on' }).click();
    await expect(panelHarness.getByRole('button', { name: 'Retry' })).toBeVisible();
    await panelHarness.screenshot({ path: testInfo.outputPath('error.png'), fullPage: true });

    await panelHarness.evaluate(async () => {
      await chrome.storage.local.set({
        generation: { status: 'succeeded', message: 'Demo result ready.', isDemo: true },
      });
    });
    await panelHarness.reload();
    await panelHarness.getByRole('button', { name: 'Try on' }).click();
    await panelHarness.getByRole('button', { name: 'Start over' }).click();
    await expect(panelHarness.getByRole('heading', { name: 'Choose a garment' })).toBeVisible();
    await panelHarness
      .getByLabel('Upload garment screenshot')
      .setInputFiles(resolve('public/fixture/dress.png'));
    await expect(panelHarness.getByAltText('Upload garment screenshot preview')).toBeVisible();

    const settings = await context.newPage();
    await settings.setViewportSize({ width: 360, height: 800 });
    await settings.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(settings.getByRole('heading', { name: 'Settings & privacy' })).toBeVisible();
    await settings.screenshot({ path: testInfo.outputPath('settings.png'), fullPage: true });
    await settings.getByRole('button', { name: 'Clear all locally stored data' }).click();
    await expect(settings.getByText(/All locally stored images/)).toBeVisible();
    await panelHarness.reload();
    await panelHarness.getByRole('button', { name: 'Try on' }).click();
    await expect(panelHarness.getByText('Add your body photo')).toBeVisible();

    const pickerHarness = await context.newPage();
    await pickerHarness.goto(`chrome-extension://${extensionId}/picker-harness.html`);
    await expect(pickerHarness.locator('[data-virtual-try-on-picker]')).toHaveCount(1);
    await pickerHarness.keyboard.press('Escape');
    await expect(pickerHarness.locator('[data-virtual-try-on-picker]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
