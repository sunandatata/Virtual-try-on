import { resolvePickerTab } from './picker-tab-context';

export type PagePickerResponse = { ok: true } | { ok: false; error: string };

export type PreparePagePickerResponse =
  { ok: true; tabId: number; isFixture: boolean; url?: string } | { ok: false; error: string };

const noContextMessage =
  'Click the Virtual Try-On toolbar icon once while viewing this shopping page, then choose Pick from this page.';
const restrictedMessage =
  'Chrome does not allow product selection on this page. Open the retailer’s normal product page.';
const permissionDeniedMessage =
  'Virtual Try-On needs access to this store page to let you select a product. Allow access or upload an image.';
const injectionFailedMessage =
  'The product picker could not start on this page. You can retry or upload the product image.';
const pdfMessage =
  'Chrome’s built-in PDF viewer cannot be used for product picking. Open the product listing page instead.';

type PageInfo = { ok: true; url: string; title?: string } | { ok: false } | undefined;

function isPdfTab(tab: chrome.tabs.Tab, url: URL): boolean {
  if (/\.pdf(?:$|[?#])/i.test(url.href)) return true;
  if (/\.pdf\b/i.test(tab.title ?? '') && url.protocol === 'chrome-extension:') return true;
  const source = url.searchParams.get('src') ?? url.searchParams.get('url') ?? '';
  return /\.pdf(?:$|[?#])/i.test(source);
}

function classifyPage(
  rawUrl: string | undefined,
  tab: chrome.tabs.Tab,
  chromeApi: typeof chrome,
): { kind: 'fixture' | 'web'; url: URL } | { kind: 'restricted'; error: string } | undefined {
  if (!rawUrl) return undefined;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'restricted', error: restrictedMessage };
  }

  const fixtureUrls = [
    chromeApi.runtime.getURL('fixture.html'),
    chromeApi.runtime.getURL('picker-fixtures.html'),
  ];
  if (fixtureUrls.includes(url.href)) return { kind: 'fixture', url };
  if (
    (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) ||
    url.hostname === 'chromewebstore.google.com'
  ) {
    return { kind: 'restricted', error: restrictedMessage };
  }
  if (isPdfTab(tab, url)) return { kind: 'restricted', error: pdfMessage };
  if (
    ['chrome:', 'edge:', 'about:', 'chrome-extension:', 'devtools:', 'view-source:'].includes(
      url.protocol,
    )
  ) {
    return { kind: 'restricted', error: restrictedMessage };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'restricted', error: restrictedMessage };
  }
  return { kind: 'web', url };
}

async function getTabUrl(tabId: number, chromeApi: typeof chrome): Promise<string | undefined> {
  try {
    return (await chromeApi.tabs.get(tabId)).url;
  } catch {
    return undefined;
  }
}

async function getInjectedPageInfo(tabId: number, chromeApi: typeof chrome): Promise<PageInfo> {
  try {
    return (await chromeApi.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' })) as PageInfo;
  } catch {
    return undefined;
  }
}

async function injectContentScript(tabId: number, chromeApi: typeof chrome): Promise<void> {
  await chromeApi.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
}

export async function preparePagePicker(
  sidePanelTabId?: number,
  chromeApi: typeof chrome = chrome,
): Promise<PreparePagePickerResponse> {
  const resolved = await resolvePickerTab(sidePanelTabId, chromeApi);
  if (!resolved.ok) {
    return { ok: false, error: noContextMessage };
  }
  const { tab } = resolved;
  if (tab.id === undefined) return { ok: false, error: noContextMessage };

  let pageUrl = resolved.url ?? tab.url;
  let classification = classifyPage(pageUrl, tab, chromeApi);
  if (classification?.kind === 'restricted') {
    return { ok: false, error: classification.error };
  }
  if (classification?.kind === 'fixture') {
    return { ok: true, tabId: tab.id, isFixture: true, url: classification.url.href };
  }

  // A missing URL is not proof that activeTab is unavailable. Try the exact tab first.
  try {
    await injectContentScript(tab.id, chromeApi);
    const pageInfo = await getInjectedPageInfo(tab.id, chromeApi);
    pageUrl = pageUrl ?? (pageInfo?.ok ? pageInfo.url : undefined);
    classification = classifyPage(pageUrl, tab, chromeApi);
    if (classification?.kind === 'restricted') {
      return { ok: false, error: classification.error };
    }
    return {
      ok: true,
      tabId: tab.id,
      isFixture: classification?.kind === 'fixture',
      ...(pageUrl ? { url: pageUrl } : {}),
    };
  } catch {
    pageUrl = pageUrl ?? (await getTabUrl(tab.id, chromeApi));
    classification = classifyPage(pageUrl, tab, chromeApi);
    if (classification?.kind === 'restricted') {
      return { ok: false, error: classification.error };
    }
    if (classification?.kind !== 'web') {
      return { ok: false, error: noContextMessage };
    }
    if (resolved.source === 'active-tab') {
      return { ok: false, error: noContextMessage };
    }

    const originPattern = `${classification.url.origin}/*`;
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
      if (!granted) return { ok: false, error: permissionDeniedMessage };
    }

    try {
      await injectContentScript(tab.id, chromeApi);
      const pageInfo = await getInjectedPageInfo(tab.id, chromeApi);
      return {
        ok: true,
        tabId: tab.id,
        isFixture: false,
        url: pageInfo?.ok ? pageInfo.url : classification.url.href,
      };
    } catch {
      return { ok: false, error: injectionFailedMessage };
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
    return { ok: false, error: injectionFailedMessage };
  }
}
