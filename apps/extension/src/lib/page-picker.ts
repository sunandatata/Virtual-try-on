export type PagePickerResponse = { ok: true } | { ok: false; error: string };

export type PreparePagePickerResponse =
  { ok: true; tabId: number; isFixture: boolean } | { ok: false; error: string };

const webStoreMessage =
  'Chrome does not allow extensions to read the Chrome Web Store. Open the product on its retailer site instead.';
const restrictedMessage =
  'Chrome protects browser pages and settings from extensions. Open a normal shopping page to pick a product.';
const pdfMessage =
  'Chrome’s built-in PDF viewer cannot be used for product picking. Open the product listing page instead.';

function isPdfTab(tab: chrome.tabs.Tab, url: URL): boolean {
  if (/\.pdf(?:$|[?#])/i.test(url.href)) return true;
  if (/\.pdf\b/i.test(tab.title ?? '') && url.protocol === 'chrome-extension:') return true;
  const source = url.searchParams.get('src') ?? url.searchParams.get('url') ?? '';
  return /\.pdf(?:$|[?#])/i.test(source);
}

export async function preparePagePicker(
  chromeApi: typeof chrome = chrome,
): Promise<PreparePagePickerResponse> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    [tab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
  } catch {
    return {
      ok: false,
      error: 'Could not find the active tab. Switch to the shopping page and try again.',
    };
  }
  if (tab?.id === undefined) {
    return { ok: false, error: 'No active browser tab found. Switch to the shop page and retry.' };
  }

  let url: URL;
  try {
    if (!tab.url) throw new Error('Missing tab URL');
    url = new URL(tab.url);
  } catch {
    return {
      ok: false,
      error: 'Chrome did not share this tab’s address. Refresh the shopping page and retry.',
    };
  }

  const fixtureUrls = [
    chromeApi.runtime.getURL('fixture.html'),
    chromeApi.runtime.getURL('picker-fixtures.html'),
  ];
  if (fixtureUrls.includes(tab.url)) {
    return { ok: true, tabId: tab.id, isFixture: true };
  }
  if (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) {
    return { ok: false, error: webStoreMessage };
  }
  if (url.hostname === 'chromewebstore.google.com') {
    return { ok: false, error: webStoreMessage };
  }
  if (isPdfTab(tab, url)) return { ok: false, error: pdfMessage };
  if (url.protocol === 'chrome:' || url.protocol === 'edge:' || url.protocol === 'about:') {
    return { ok: false, error: restrictedMessage };
  }
  if (url.protocol === 'chrome-extension:' || url.protocol === 'devtools:') {
    return { ok: false, error: restrictedMessage };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      error:
        'This page type is not supported. Open the retailer’s HTTP or HTTPS product page instead.',
    };
  }

  // The toolbar click normally grants activeTab access. Try that low-friction path first.
  try {
    await chromeApi.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    return { ok: true, tabId: tab.id, isFixture: false };
  } catch {
    const originPattern = `${url.origin}/*`;
    let alreadyAllowed = false;
    try {
      alreadyAllowed = await chromeApi.permissions.contains({ origins: [originPattern] });
    } catch {
      // Request below provides the authoritative result when contains is unavailable.
    }
    if (!alreadyAllowed) {
      let granted = false;
      try {
        granted = await chromeApi.permissions.request({ origins: [originPattern] });
      } catch {
        granted = false;
      }
      if (!granted) {
        return {
          ok: false,
          error: `Site access was declined. To pick a product, allow Virtual Try-On to read ${url.hostname}, or use a local image.`,
        };
      }
    }
    try {
      await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      return { ok: true, tabId: tab.id, isFixture: false };
    } catch {
      return {
        ok: false,
        error: `Chrome allowed access to ${url.hostname}, but the picker could not start. Refresh the product page and retry.`,
      };
    }
  }
}

export async function activatePagePicker(
  tabId: number,
  chromeApi: typeof chrome = chrome,
): Promise<PagePickerResponse> {
  try {
    await chromeApi.tabs.sendMessage(tabId, { type: 'OPEN_PICKER' });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'The product picker could not connect to this page. Refresh the tab and try again.',
    };
  }
}
