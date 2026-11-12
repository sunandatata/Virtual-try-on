import { describe, expect, it, vi } from 'vitest';
import { activatePagePicker } from './page-picker';

function chromeApi(tab: { id?: number; url?: string }) {
  const query = vi.fn().mockResolvedValue([tab]);
  const executeScript = vi.fn().mockResolvedValue([]);
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const api = {
    tabs: { query, sendMessage },
    scripting: { executeScript },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  } as unknown as typeof chrome;
  return { api, query, executeScript, sendMessage };
}

describe('activatePagePicker', () => {
  it('injects into the active tab when Chrome does not expose its URL', async () => {
    const { api, query, executeScript, sendMessage } = chromeApi({ id: 17 });

    await expect(activatePagePicker(api)).resolves.toEqual({ ok: true });
    expect(query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 17 },
      files: ['content.js'],
    });
    expect(sendMessage).toHaveBeenCalledWith(17, { type: 'OPEN_PICKER' });
  });

  it('does not inject into the packaged fixture page', async () => {
    const { api, executeScript, sendMessage } = chromeApi({
      id: 18,
      url: 'chrome-extension://test/fixture.html',
    });

    await expect(activatePagePicker(api)).resolves.toEqual({ ok: true });
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(18, { type: 'OPEN_PICKER' });
  });

  it('returns a useful message when there is no active tab or Chrome blocks injection', async () => {
    const noTab = chromeApi({});
    await expect(activatePagePicker(noTab.api)).resolves.toMatchObject({ ok: false });
    expect(noTab.executeScript).not.toHaveBeenCalled();

    const blocked = chromeApi({ id: 19 });
    blocked.executeScript.mockRejectedValue(new Error('Restricted page'));
    await expect(activatePagePicker(blocked.api)).resolves.toEqual({
      ok: false,
      error: 'Chrome could not access this page. Refresh the shop tab or choose a local image.',
    });
    expect(blocked.sendMessage).not.toHaveBeenCalled();
  });
});
