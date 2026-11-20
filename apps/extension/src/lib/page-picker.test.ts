import { describe, expect, it, vi } from 'vitest';
import { activatePagePicker, preparePagePicker } from './page-picker';

function chromeApi(
  tab: { id?: number; url?: string; title?: string },
  options: {
    initialInjection?: 'success' | 'failure';
    granted?: boolean;
    existingPermission?: boolean;
    retryInjection?: 'success' | 'failure';
  } = {},
) {
  const query = vi.fn().mockResolvedValue([tab]);
  const executeScript = vi.fn();
  if (options.initialInjection === 'failure') {
    executeScript.mockRejectedValueOnce(new Error('Missing host permission'));
    if (options.retryInjection === 'failure') {
      executeScript.mockRejectedValueOnce(new Error('Injection failed'));
    } else {
      executeScript.mockResolvedValueOnce([]);
    }
  } else {
    executeScript.mockResolvedValueOnce([]);
  }
  const contains = vi.fn().mockResolvedValue(options.existingPermission ?? false);
  const request = vi.fn().mockResolvedValue(options.granted ?? false);
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const api = {
    tabs: { query, sendMessage },
    scripting: { executeScript },
    permissions: { contains, request },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
  } as unknown as typeof chrome;
  return { api, query, executeScript, contains, request, sendMessage };
}

describe('preparePagePicker', () => {
  it('uses existing activeTab access without prompting', async () => {
    const { api, query, executeScript, request } = chromeApi({
      id: 17,
      url: 'https://shop.example/products/dress',
    });

    await expect(preparePagePicker(api)).resolves.toEqual({
      ok: true,
      tabId: 17,
      isFixture: false,
    });
    expect(query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 17 },
      files: ['content.js'],
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('requests only the current retailer origin after activeTab injection is unavailable', async () => {
    const { api, executeScript, contains, request } = chromeApi(
      { id: 19, url: 'https://shop.example/products/dress?color=blue' },
      { initialInjection: 'failure', granted: true },
    );

    await expect(preparePagePicker(api)).resolves.toEqual({
      ok: true,
      tabId: 19,
      isFixture: false,
    });
    expect(contains).toHaveBeenCalledWith({ origins: ['https://shop.example/*'] });
    expect(request).toHaveBeenCalledWith({ origins: ['https://shop.example/*'] });
    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  it('reuses an already granted retailer origin', async () => {
    const { api, request } = chromeApi(
      { id: 20, url: 'https://shop.example/products/dress' },
      { initialInjection: 'failure', existingPermission: true },
    );

    await expect(preparePagePicker(api)).resolves.toMatchObject({ ok: true, tabId: 20 });
    expect(request).not.toHaveBeenCalled();
  });

  it('handles permission denial without attempting injection again', async () => {
    const { api, executeScript, request } = chromeApi(
      { id: 21, url: 'https://shop.example/products/dress' },
      { initialInjection: 'failure', granted: false },
    );

    await expect(preparePagePicker(api)).resolves.toEqual({
      ok: false,
      error:
        'Site access was declined. To pick a product, allow Virtual Try-On to read shop.example, or use a local image.',
    });
    expect(request).toHaveBeenCalledOnce();
    expect(executeScript).toHaveBeenCalledOnce();
  });

  it.each([
    ['Chrome settings', { id: 22, url: 'chrome://settings/' }, /Chrome protects browser pages/],
    [
      'Chrome Web Store',
      { id: 23, url: 'https://chromewebstore.google.com/detail/example' },
      /Chrome Web Store/,
    ],
    ['PDF viewer', { id: 24, url: 'https://shop.example/size-guide.pdf' }, /PDF viewer/],
    ['file URL', { id: 25, url: 'file:///C:/product.html' }, /HTTP or HTTPS/],
  ] as const)('explains why picker access is unavailable on %s', async (_label, tab, error) => {
    const { api, executeScript, request } = chromeApi(tab);
    await expect(preparePagePicker(api)).resolves.toMatchObject({ ok: false, error });
    expect(executeScript).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('allows the packaged fixture without requesting retailer access', async () => {
    const { api, executeScript, request } = chromeApi({
      id: 26,
      url: 'chrome-extension://test/fixture.html',
    });
    await expect(preparePagePicker(api)).resolves.toEqual({
      ok: true,
      tabId: 26,
      isFixture: true,
    });
    expect(executeScript).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('reports injection failure after site access was granted', async () => {
    const { api } = chromeApi(
      { id: 27, url: 'https://shop.example/products/dress' },
      { initialInjection: 'failure', granted: true, retryInjection: 'failure' },
    );
    await expect(preparePagePicker(api)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Chrome allowed access to shop.example'),
    });
  });

  it('returns a useful error if the active tab cannot be found', async () => {
    const { api, executeScript, request } = chromeApi({});
    await expect(preparePagePicker(api)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('No active browser tab'),
    });
    expect(executeScript).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('activatePagePicker', () => {
  it('sends the picker message to the tab prepared by the side panel', async () => {
    const { api, sendMessage } = chromeApi({ id: 28 });
    await expect(activatePagePicker(28, api)).resolves.toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith(28, { type: 'OPEN_PICKER' });
  });

  it('reports a disconnected content script', async () => {
    const { api, sendMessage } = chromeApi({ id: 29 });
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    await expect(activatePagePicker(29, api)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Refresh the tab'),
    });
  });
});
