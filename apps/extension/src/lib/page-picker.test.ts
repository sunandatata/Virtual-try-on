import { describe, expect, it, vi } from 'vitest';
import { PICKER_CONTEXT_KEY } from './picker-tab-context';
import { activatePagePicker, preparePagePicker } from './page-picker';

type Tab = { id?: number; windowId?: number; url?: string; title?: string; active?: boolean };
type MockOptions = {
  tabs?: Tab[];
  injection?: Array<'success' | 'failure'>;
  pageInfoUrl?: string;
  granted?: boolean;
  existingPermission?: boolean;
  contexts?: Record<string, unknown>;
};

function chromeApi(options: MockOptions = {}) {
  const tabs = options.tabs ?? [
    { id: 17, windowId: 1, active: true, url: 'https://shop.example/dress' },
  ];
  const query = vi.fn().mockResolvedValue(tabs.filter((tab) => tab.active));
  const get = vi.fn(async (tabId: number) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) throw new Error('No tab with id.');
    return tab;
  });
  const sendMessage = vi.fn(async (_tabId: number, message: { type: string }) => {
    if (message.type === 'GET_PAGE_CONTEXT') {
      const url = options.pageInfoUrl ?? tabs[0]?.url;
      return url ? { ok: true, url, title: 'Synthetic product' } : { ok: false };
    }
    return undefined;
  });
  const injection = [...(options.injection ?? ['success'])];
  const executeScript = vi.fn(async () => {
    if (injection.shift() === 'failure') throw new Error('Missing host permission');
    return [];
  });
  const contains = vi.fn().mockResolvedValue(options.existingPermission ?? false);
  const request = vi.fn().mockResolvedValue(options.granted ?? false);
  const stored: Record<string, unknown> = {
    ...(options.contexts ? { [PICKER_CONTEXT_KEY]: options.contexts } : {}),
  };
  const session = {
    get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
    set: vi.fn(async (value: Record<string, unknown>) => Object.assign(stored, value)),
  };
  const api = {
    tabs: { query, get, sendMessage },
    scripting: { executeScript },
    permissions: { contains, request },
    storage: { session },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  } as unknown as typeof chrome;
  return { api, query, get, sendMessage, executeScript, contains, request, session, stored };
}

describe('preparePagePicker', () => {
  it('injects into the tab ID supplied by the tab-specific side panel', async () => {
    const first = { id: 17, windowId: 1, url: 'https://first.example/dress' };
    const second = { id: 18, windowId: 1, active: true, url: 'https://second.example/top' };
    const { api, query, executeScript } = chromeApi({ tabs: [first, second] });

    await expect(preparePagePicker(17, api)).resolves.toMatchObject({
      ok: true,
      tabId: 17,
      isFixture: false,
      url: first.url,
    });
    expect(query).not.toHaveBeenCalled();
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 17 }, files: ['content.js'] });
  });

  it('uses activeTab injection when a tab ID exists but Chrome omitted its URL', async () => {
    const tab = { id: 19, windowId: 1, active: true };
    const { api, executeScript, sendMessage } = chromeApi({
      tabs: [tab],
      pageInfoUrl: 'https://shop.example/products/dress',
    });

    await expect(preparePagePicker(undefined, api)).resolves.toEqual({
      ok: true,
      tabId: 19,
      isFixture: false,
      url: 'https://shop.example/products/dress',
    });
    expect(executeScript).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(19, { type: 'GET_PAGE_CONTEXT' });
  });

  it('uses the cached toolbar URL when the tab URL is absent and activeTab injection fails', async () => {
    const tab = { id: 20, windowId: 2 };
    const { api, request, executeScript } = chromeApi({
      tabs: [tab],
      injection: ['failure', 'success'],
      granted: true,
      contexts: {
        '2': {
          tabId: 20,
          windowId: 2,
          url: 'https://shop.example/products/dress',
          timestamp: Date.now(),
        },
      },
    });

    await expect(preparePagePicker(20, api)).resolves.toMatchObject({ ok: true, tabId: 20 });
    expect(request).toHaveBeenCalledWith({ origins: ['https://shop.example/*'] });
    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  it('targets the side-panel tab even after the active tab changes', async () => {
    const panelTab = { id: 31, windowId: 1, url: 'https://first.example/product' };
    const newlyActive = {
      id: 32,
      windowId: 1,
      active: true,
      url: 'https://second.example/product',
    };
    const { api, executeScript, query } = chromeApi({ tabs: [panelTab, newlyActive] });

    await expect(preparePagePicker(31, api)).resolves.toMatchObject({ ok: true, tabId: 31 });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 31 }, files: ['content.js'] });
    expect(query).not.toHaveBeenCalled();
  });

  it('uses the latest matching toolbar context in the active Chrome window', async () => {
    const windowOneActive = {
      id: 41,
      windowId: 1,
      url: 'https://one-active.example',
    };
    const windowOneToolbar = { id: 42, windowId: 1, url: 'https://one-toolbar.example' };
    const windowTwoActive = {
      id: 51,
      windowId: 2,
      active: true,
      url: 'https://two-active.example',
    };
    const windowTwoToolbar = { id: 52, windowId: 2, url: 'https://two-toolbar.example' };
    const { api, query } = chromeApi({
      tabs: [windowOneActive, windowOneToolbar, windowTwoActive, windowTwoToolbar],
      contexts: {
        '1': { tabId: 42, windowId: 1, url: windowOneToolbar.url, timestamp: Date.now() },
        '2': { tabId: 52, windowId: 2, url: windowTwoToolbar.url, timestamp: Date.now() },
      },
    });
    await expect(preparePagePicker(undefined, api)).resolves.toMatchObject({
      ok: true,
      tabId: 52,
      url: windowTwoToolbar.url,
    });
    expect(query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
  });

  it.each([
    ['Chrome settings', { id: 61, windowId: 1, active: true, url: 'chrome://settings/' }],
    [
      'extension settings',
      { id: 62, windowId: 1, active: true, url: 'chrome-extension://test/options.html' },
    ],
    [
      'Chrome Web Store',
      {
        id: 63,
        windowId: 1,
        active: true,
        url: 'https://chromewebstore.google.com/detail/example',
      },
    ],
    ['PDF document', { id: 64, windowId: 1, active: true, url: 'https://shop.example/guide.pdf' }],
  ] as const)('does not inject into %s', async (_label, tab) => {
    const { api, executeScript, request } = chromeApi({ tabs: [tab] });
    await expect(preparePagePicker(undefined, api)).resolves.toMatchObject({
      ok: false,
      error: /Chrome does not allow product selection/,
    });
    expect(executeScript).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the packaged synthetic fixture without requesting site permission', async () => {
    const tab = { id: 64, windowId: 1, active: true, url: 'chrome-extension://test/fixture.html' };
    const { api, executeScript, request } = chromeApi({ tabs: [tab] });
    await expect(preparePagePicker(undefined, api)).resolves.toMatchObject({
      ok: true,
      tabId: 64,
      isFixture: true,
    });
    expect(executeScript).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('requests only the exact retailer origin when access is needed and granted', async () => {
    const tab = { id: 65, windowId: 1, active: true, url: 'https://shop.example/item?color=blue' };
    const { api, executeScript, request } = chromeApi({
      tabs: [tab],
      injection: ['failure', 'success'],
      granted: true,
      contexts: {
        '1': { tabId: 65, windowId: 1, url: tab.url, timestamp: Date.now() },
      },
    });
    await expect(preparePagePicker(undefined, api)).resolves.toMatchObject({ ok: true, tabId: 65 });
    expect(request).toHaveBeenCalledWith({ origins: ['https://shop.example/*'] });
    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  it('uses actionable wording when the origin permission is denied', async () => {
    const tab = { id: 66, windowId: 1, active: true, url: 'https://shop.example/item' };
    const { api, executeScript, request } = chromeApi({
      tabs: [tab],
      injection: ['failure'],
      granted: false,
      contexts: {
        '1': { tabId: 66, windowId: 1, url: tab.url, timestamp: Date.now() },
      },
    });
    await expect(preparePagePicker(undefined, api)).resolves.toEqual({
      ok: false,
      error:
        'Virtual Try-On needs access to this store page to let you select a product. Allow access or upload an image.',
    });
    expect(request).toHaveBeenCalledOnce();
    expect(executeScript).toHaveBeenCalledOnce();
  });

  it('reports retry or upload when injection still fails after origin access', async () => {
    const tab = { id: 67, windowId: 1, active: true, url: 'https://shop.example/item' };
    const { api, executeScript } = chromeApi({
      tabs: [tab],
      injection: ['failure', 'failure'],
      granted: true,
      contexts: {
        '1': { tabId: 67, windowId: 1, url: tab.url, timestamp: Date.now() },
      },
    });
    await expect(preparePagePicker(undefined, api)).resolves.toEqual({
      ok: false,
      error:
        'The product picker could not start on this page. You can retry or upload the product image.',
    });
    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  it('shows the toolbar action message when no browser tab is available', async () => {
    const { api, executeScript } = chromeApi({ tabs: [] });
    await expect(preparePagePicker(undefined, api)).resolves.toEqual({
      ok: false,
      error:
        'Click the Virtual Try-On toolbar icon once while viewing this shopping page, then choose Pick from this page.',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('asks the user to invoke the toolbar action when the side panel has no tab context', async () => {
    const tab = { id: 68, windowId: 1, active: true, url: 'https://shop.example/item' };
    const { api, executeScript, request } = chromeApi({
      tabs: [tab],
      injection: ['failure'],
    });
    await expect(preparePagePicker(undefined, api)).resolves.toEqual({
      ok: false,
      error:
        'Click the Virtual Try-On toolbar icon once while viewing this shopping page, then choose Pick from this page.',
    });
    expect(executeScript).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('activatePagePicker', () => {
  it('starts the picker exactly once on the prepared tab', async () => {
    const { api, sendMessage } = chromeApi({ tabs: [{ id: 71, windowId: 1 }] });
    await expect(activatePagePicker(71, api)).resolves.toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(71, { type: 'OPEN_PICKER' });
  });

  it('shows retry or upload for a stale content script', async () => {
    const { api, sendMessage } = chromeApi({ tabs: [{ id: 72, windowId: 1 }] });
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    await expect(activatePagePicker(72, api)).resolves.toEqual({
      ok: false,
      error:
        'The product picker could not start on this page. You can retry or upload the product image.',
    });
  });
});
