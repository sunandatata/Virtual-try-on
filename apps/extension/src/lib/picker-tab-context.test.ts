import { describe, expect, it, vi } from 'vitest';
import {
  getPickerToolbarContext,
  openPickerSidePanelForTab,
  PICKER_CONTEXT_KEY,
  PICKER_CONTEXT_MAX_AGE_MS,
  removePickerToolbarContextForTab,
  resolvePickerTab,
  savePickerToolbarContext,
  updatePickerToolbarContextUrl,
} from './picker-tab-context';

function chromeApi(tabs: chrome.tabs.Tab[], stored: Record<string, unknown> = {}) {
  const get = vi.fn(async (tabId: number) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) throw new Error('No tab with id.');
    return tab;
  });
  const query = vi.fn(async () => tabs.filter((tab) => tab.active));
  const session = {
    get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
    set: vi.fn(async (value: Record<string, unknown>) => Object.assign(stored, value)),
  };
  const sidePanel = {
    setOptions: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(undefined),
  };
  const api = {
    tabs: { get, query },
    storage: { session },
    sidePanel,
  } as unknown as typeof chrome;
  return { api, get, query, session, sidePanel, stored };
}

describe('picker toolbar tab context', () => {
  it('opens a tab-bound side panel and records only the latest context for its window', async () => {
    const first = { id: 10, windowId: 1, url: 'https://shop.example/one' } as chrome.tabs.Tab;
    const second = { id: 11, windowId: 1, url: 'https://shop.example/two' } as chrome.tabs.Tab;
    const { api, sidePanel, stored } = chromeApi([first, second]);

    await openPickerSidePanelForTab(first, api, 100);
    await openPickerSidePanelForTab(second, api, 200);

    expect(sidePanel.setOptions).toHaveBeenLastCalledWith({
      tabId: 11,
      path: 'sidepanel.html?tabId=11',
    });
    expect(sidePanel.open).toHaveBeenLastCalledWith({ tabId: 11 });
    expect(stored[PICKER_CONTEXT_KEY]).toEqual({
      '1': { tabId: 11, windowId: 1, url: 'https://shop.example/two', timestamp: 200 },
    });
  });

  it('keeps the most recent toolbar context separately for each Chrome window', async () => {
    const one = { id: 21, windowId: 1, url: 'https://one.example' } as chrome.tabs.Tab;
    const two = { id: 22, windowId: 2, url: 'https://two.example' } as chrome.tabs.Tab;
    const { api, stored } = chromeApi([one, two]);

    await savePickerToolbarContext(one, api, 100);
    await savePickerToolbarContext(two, api, 200);

    expect(stored[PICKER_CONTEXT_KEY]).toMatchObject({
      '1': { tabId: 21, windowId: 1 },
      '2': { tabId: 22, windowId: 2 },
    });
    await expect(getPickerToolbarContext(2, api)).resolves.toMatchObject({ tabId: 22 });
  });

  it('uses the tab associated with the side panel when the active tab changes', async () => {
    const sidePanelTab = { id: 31, windowId: 1, url: 'https://first.example' } as chrome.tabs.Tab;
    const activeTab = {
      id: 32,
      windowId: 1,
      active: true,
      url: 'https://second.example',
    } as chrome.tabs.Tab;
    const { api, query } = chromeApi([sidePanelTab, activeTab]);

    await expect(resolvePickerTab(31, api)).resolves.toMatchObject({
      ok: true,
      tab: sidePanelTab,
      source: 'side-panel',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('uses a matching cached toolbar URL when Chrome omits the tab URL', async () => {
    const tab = { id: 41, windowId: 2 } as chrome.tabs.Tab;
    const stored = {
      [PICKER_CONTEXT_KEY]: {
        '2': { tabId: 41, windowId: 2, url: 'https://shop.example/product', timestamp: 100 },
      },
    };
    const { api } = chromeApi([tab], stored);

    await expect(resolvePickerTab(41, api, 200)).resolves.toMatchObject({
      ok: true,
      tab,
      url: 'https://shop.example/product',
      source: 'side-panel',
    });
  });

  it('updates the cached URL without extending its original age', async () => {
    const tab = { id: 51, windowId: 3, url: 'https://shop.example/new-page' } as chrome.tabs.Tab;
    const stored = {
      [PICKER_CONTEXT_KEY]: {
        '3': { tabId: 51, windowId: 3, url: 'https://shop.example/old-page', timestamp: 100 },
      },
    };
    const { api, stored: saved } = chromeApi([tab], stored);

    await updatePickerToolbarContextUrl(51, 3, tab.url!, api);

    expect(saved[PICKER_CONTEXT_KEY]).toEqual({
      '3': { tabId: 51, windowId: 3, url: tab.url, timestamp: 100 },
    });
  });

  it('removes cached context when its tab closes', async () => {
    const tab = { id: 61, windowId: 4, url: 'https://shop.example' } as chrome.tabs.Tab;
    const { api, stored } = chromeApi([tab]);
    await savePickerToolbarContext(tab, api, 100);

    await removePickerToolbarContextForTab(61, api);

    expect(stored[PICKER_CONTEXT_KEY]).toEqual({});
  });

  it('falls back to the active tab when the cached tab has closed', async () => {
    const active = {
      id: 72,
      windowId: 5,
      active: true,
      url: 'https://active.example',
    } as chrome.tabs.Tab;
    const stored = {
      [PICKER_CONTEXT_KEY]: {
        '5': { tabId: 71, windowId: 5, url: 'https://closed.example', timestamp: 100 },
      },
    };
    const { api, stored: saved } = chromeApi([active], stored);

    await expect(resolvePickerTab(undefined, api, 200)).resolves.toMatchObject({
      ok: true,
      tab: active,
      source: 'active-tab',
    });
    expect(saved[PICKER_CONTEXT_KEY]).toEqual({});
  });

  it('falls back to the active tab when the cached context is stale', async () => {
    const active = {
      id: 82,
      windowId: 6,
      active: true,
      url: 'https://active.example',
    } as chrome.tabs.Tab;
    const stored = {
      [PICKER_CONTEXT_KEY]: {
        '6': {
          tabId: 81,
          windowId: 6,
          url: 'https://stale.example',
          timestamp: 1,
        },
      },
    };
    const { api, stored: saved } = chromeApi(
      [active, { id: 81, windowId: 6 } as chrome.tabs.Tab],
      stored,
    );

    await expect(
      resolvePickerTab(undefined, api, PICKER_CONTEXT_MAX_AGE_MS + 2),
    ).resolves.toMatchObject({ ok: true, tab: active, source: 'active-tab' });
    expect(saved[PICKER_CONTEXT_KEY]).toEqual({});
  });
});
