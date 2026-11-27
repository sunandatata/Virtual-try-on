export const PICKER_CONTEXT_KEY = 'pickerToolbarContexts';
export const PICKER_CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;

export type PickerToolbarContext = {
  tabId: number;
  windowId: number;
  url?: string;
  timestamp: number;
};

type ContextMap = Record<string, PickerToolbarContext>;

async function readContexts(chromeApi: typeof chrome): Promise<ContextMap> {
  try {
    const stored = await chromeApi.storage.session.get(PICKER_CONTEXT_KEY);
    const contexts = stored[PICKER_CONTEXT_KEY];
    return contexts && typeof contexts === 'object' ? (contexts as ContextMap) : {};
  } catch {
    return {};
  }
}

async function writeContexts(chromeApi: typeof chrome, contexts: ContextMap): Promise<void> {
  await chromeApi.storage.session.set({ [PICKER_CONTEXT_KEY]: contexts });
}

export async function savePickerToolbarContext(
  tab: chrome.tabs.Tab,
  chromeApi: typeof chrome = chrome,
  now = Date.now(),
): Promise<PickerToolbarContext | undefined> {
  if (tab.id === undefined || tab.windowId === undefined) return undefined;
  const context: PickerToolbarContext = {
    tabId: tab.id,
    windowId: tab.windowId,
    ...(tab.url ? { url: tab.url } : {}),
    timestamp: now,
  };
  const contexts = await readContexts(chromeApi);
  contexts[String(tab.windowId)] = context;
  await writeContexts(chromeApi, contexts);
  return context;
}

export async function removePickerToolbarContextForTab(
  tabId: number,
  chromeApi: typeof chrome = chrome,
): Promise<void> {
  const contexts = await readContexts(chromeApi);
  let changed = false;
  for (const [windowId, context] of Object.entries(contexts)) {
    if (context?.tabId === tabId) {
      delete contexts[windowId];
      changed = true;
    }
  }
  if (changed) await writeContexts(chromeApi, contexts);
}

export async function updatePickerToolbarContextUrl(
  tabId: number,
  windowId: number,
  url: string,
  chromeApi: typeof chrome = chrome,
): Promise<void> {
  const contexts = await readContexts(chromeApi);
  const context = contexts[String(windowId)];
  if (context?.tabId !== tabId) return;
  contexts[String(windowId)] = { ...context, url };
  await writeContexts(chromeApi, contexts);
}

export async function getPickerToolbarContext(
  windowId: number,
  chromeApi: typeof chrome = chrome,
): Promise<PickerToolbarContext | undefined> {
  const contexts = await readContexts(chromeApi);
  return contexts[String(windowId)];
}

export async function openPickerSidePanelForTab(
  tab: chrome.tabs.Tab,
  chromeApi: typeof chrome = chrome,
  now = Date.now(),
): Promise<boolean> {
  if (tab.id === undefined || tab.windowId === undefined) return false;
  const contextSaved = savePickerToolbarContext(tab, chromeApi, now).catch(() => undefined);
  await chromeApi.sidePanel.setOptions({
    tabId: tab.id,
    path: `sidepanel.html?tabId=${tab.id}`,
    enabled: true,
  });
  // Try tab-specific open first; fall back to window-level open (Chrome <116 or restricted pages).
  try {
    await chromeApi.sidePanel.open({ tabId: tab.id });
  } catch {
    await chromeApi.sidePanel.open({ windowId: tab.windowId });
  }
  await contextSaved;
  return true;
}

export type PickerTabResolution =
  | {
      ok: true;
      tab: chrome.tabs.Tab;
      url?: string;
      source: 'side-panel' | 'toolbar-context' | 'active-tab';
    }
  | { ok: false; reason: 'no-active-tab' | 'stale-side-panel-tab' };

export async function resolvePickerTab(
  sidePanelTabId?: number,
  chromeApi: typeof chrome = chrome,
  now = Date.now(),
): Promise<PickerTabResolution> {
  if (sidePanelTabId !== undefined) {
    try {
      const tab = await chromeApi.tabs.get(sidePanelTabId);
      const context =
        tab.url || tab.windowId === undefined
          ? undefined
          : await getPickerToolbarContext(tab.windowId, chromeApi);
      const cachedUrl =
        context &&
        context.tabId === tab.id &&
        context.windowId === tab.windowId &&
        now - context.timestamp <= PICKER_CONTEXT_MAX_AGE_MS
          ? context.url
          : undefined;
      return {
        ok: true,
        tab,
        ...((tab.url ?? cachedUrl) ? { url: tab.url ?? cachedUrl } : {}),
        source: 'side-panel',
      };
    } catch {
      return { ok: false, reason: 'stale-side-panel-tab' };
    }
  }

  let active: chrome.tabs.Tab | undefined;
  try {
    [active] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
  } catch {
    return { ok: false, reason: 'no-active-tab' };
  }
  if (active?.id === undefined) return { ok: false, reason: 'no-active-tab' };

  if (active.windowId !== undefined) {
    const contexts = await readContexts(chromeApi);
    const key = String(active.windowId);
    const context = contexts[key];
    if (context) {
      let rememberedTab: chrome.tabs.Tab | undefined;
      try {
        rememberedTab = await chromeApi.tabs.get(context.tabId);
      } catch {
        delete contexts[key];
        await writeContexts(chromeApi, contexts);
      }
      const fresh = now - context.timestamp <= PICKER_CONTEXT_MAX_AGE_MS;
      if (rememberedTab?.id !== undefined && rememberedTab.windowId === active.windowId && fresh) {
        const url = rememberedTab.url ?? context.url;
        if (rememberedTab.url && context.url !== rememberedTab.url) {
          contexts[key] = { ...context, url: rememberedTab.url };
          await writeContexts(chromeApi, contexts);
        }
        return {
          ok: true,
          tab: rememberedTab,
          ...(url ? { url } : {}),
          source: 'toolbar-context',
        };
      }
      if (!fresh) {
        delete contexts[key];
        await writeContexts(chromeApi, contexts);
      }
    }
  }

  return {
    ok: true,
    tab: active,
    ...(active.url ? { url: active.url } : {}),
    source: 'active-tab',
  };
}
