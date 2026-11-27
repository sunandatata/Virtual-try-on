import { extensionMessageSchema } from '@virtual-try-on/shared';
import type { ProductMetadata } from '@virtual-try-on/shared';
import { processActiveBatchStep } from './lib/batch-engine';
import { createGenerationBatch } from './lib/batch-storage';
import { getBodyProfile } from './lib/body-profile-storage';
import { createCaptureDraft } from './lib/capture';
import { getSettings } from './lib/settings';
import { saveImage } from './lib/storage';
import { activatePagePicker } from './lib/page-picker';
import {
  openPickerSidePanelForTab,
  removePickerToolbarContextForTab,
  updatePickerToolbarContextUrl,
} from './lib/picker-tab-context';
import { loadGarmentImage } from './lib/garment-image';
import type { PickerCapture } from '@virtual-try-on/shared';

const MENU_ID = 'virtual-try-on-image';
const BATCH_ALARM = 'virtual-try-on-batch';

let activeBatchRun: Promise<void> | undefined;

function scheduleBatchWake(delayMs: number): void {
  chrome.alarms.create(BATCH_ALARM, { when: Date.now() + Math.max(250, delayMs) });
}

async function notifyBatchUpdated(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'BATCH_UPDATED' });
  } catch {
    // The side panel may be closed; durable IndexedDB state remains the source of truth.
  }
}

function runBatchSafely(): Promise<void> {
  activeBatchRun ??= processActiveBatchStep({
    fetcher: fetch,
    getSettings,
    scheduleWake: scheduleBatchWake,
    notify: notifyBatchUpdated,
  })
    .catch(() => scheduleBatchWake(30_000))
    .finally(() => {
      activeBatchRun = undefined;
    });
  return activeBatchRun;
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Try this on with Virtual Try-On',
      contexts: ['image'],
    });
  });
});

chrome.action.onClicked.addListener((tab) => {
  void openPickerSidePanelForTab(tab).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void removePickerToolbarContextForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.windowId !== undefined) {
    void updatePickerToolbarContextUrl(tabId, tab.windowId, changeInfo.url);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BATCH_ALARM) void runBatchSafely();
});

async function openPanel(tab?: chrome.tabs.Tab) {
  if (tab) await openPickerSidePanelForTab(tab);
}

async function storeRemoteGarment(
  src: string,
  metadata?: ProductMetadata,
  sourcePageUrl?: string,
  options: {
    capture?: PickerCapture;
    windowId?: number;
    captureSource?: 'page-picker' | 'context-menu';
  } = {},
): Promise<{ ok: boolean; error?: string }> {
  try {
    const loaded = await loadGarmentImage({
      src,
      capture: options.capture,
      windowId: options.windowId,
    });
    const storedImage = {
      slot: 'garment',
      blob: loaded.blob,
      name: 'selected-garment',
      mime: loaded.blob.type,
      width: loaded.width,
      height: loaded.height,
      updatedAt: Date.now(),
    } as const;
    await saveImage(storedImage);
    const draft = await createCaptureDraft({
      image: storedImage,
      sourceImageUrl: src,
      sourcePageUrl: metadata?.sourceUrl ?? sourcePageUrl,
      metadata,
      captureMethod: loaded.captureMethod,
      captureSource: options.captureSource ?? 'page-picker',
    });
    try {
      await chrome.runtime.sendMessage({
        type: 'GARMENT_BYTES',
        dataUrl: '',
        sourceUrl: src,
        draftId: draft.id,
        metadata,
      });
    } catch {
      // The saved draft is durable and appears when the side panel next opens.
    }
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Could not copy this image.';
    try {
      await chrome.runtime.sendMessage({ type: 'GARMENT_FETCH_FAILED', reason });
    } catch {
      // The next side-panel open can still recover any draft saved before notification failed.
    }
    return { ok: false, error: reason };
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  await openPanel(tab);
  let details:
    | {
        ok: true;
        image: { src: string; alt: string; width: number; height: number };
        metadata: ProductMetadata;
        capture?: PickerCapture;
      }
    | { ok: false }
    | undefined;
  if (tab?.id !== undefined && /^https?:/i.test(tab.url ?? '')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      details = (await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_CONTEXT_IMAGE_DETAILS',
        src: info.srcUrl,
      })) as typeof details;
    } catch {
      // Direct image bytes remain available on sites where injection is blocked.
    }
  }
  await storeRemoteGarment(
    details?.ok ? details.image.src : info.srcUrl,
    details?.ok ? details.metadata : undefined,
    info.pageUrl ?? tab?.url,
    {
      capture: details?.ok ? details.capture : undefined,
      windowId: tab?.windowId,
      captureSource: 'context-menu',
    },
  );
});

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const parsed = extensionMessageSchema.safeParse(raw);
  if (!parsed.success) return false;
  if (parsed.data.type === 'START_PAGE_PICKER') {
    void activatePagePicker(parsed.data.tabId).then(sendResponse);
    return true;
  }
  if (parsed.data.type === 'GARMENT_SELECTED') {
    void storeRemoteGarment(
      parsed.data.image.src,
      parsed.data.metadata,
      parsed.data.metadata.sourceUrl,
      {
        capture: parsed.data.capture,
        windowId: sender.tab?.windowId,
        captureSource: 'page-picker',
      },
    ).then(sendResponse);
    return true;
  }
  if (parsed.data.type === 'START_BATCH') {
    const itemIds = parsed.data.itemIds;
    const profileId = parsed.data.profileId;
    void (async () => {
      try {
        const person = await getBodyProfile(profileId);
        if (!person) throw new Error('Choose an available body profile before starting a batch.');
        const batch = await createGenerationBatch(itemIds, person);
        sendResponse({ ok: true, batchId: batch.id });
        await runBatchSafely();
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not start this batch.',
        });
      }
    })();
    return true;
  }
  return false;
});

void runBatchSafely();
