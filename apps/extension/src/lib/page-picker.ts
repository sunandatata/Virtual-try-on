export type PagePickerResponse = { ok: true } | { ok: false; error: string };

export async function activatePagePicker(
  chromeApi: typeof chrome = chrome,
): Promise<PagePickerResponse> {
  try {
    const [tab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      return {
        ok: false,
        error: 'No active browser tab found. Switch to the shop page and retry.',
      };
    }

    const localFixture = tab.url === chromeApi.runtime.getURL('fixture.html');
    if (!localFixture) {
      await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
    }
    await chromeApi.tabs.sendMessage(tab.id, { type: 'OPEN_PICKER' });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Chrome could not access this page. Refresh the shop tab or choose a local image.',
    };
  }
}
