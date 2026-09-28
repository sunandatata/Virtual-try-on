import { extensionMessageSchema, MAX_IMAGE_BYTES } from '@virtual-try-on/shared';
import type { ProductMetadata } from '@virtual-try-on/shared';
import { processActiveBatchStep } from './lib/batch-engine';
import { createGenerationBatch } from './lib/batch-storage';
import { getBodyProfile } from './lib/body-profile-storage';
import { createCaptureDraft } from './lib/capture';
import { getSettings } from './lib/settings';
import { saveImage } from './lib/storage';

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

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId !== undefined) await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BATCH_ALARM) void runBatchSafely();
});

async function openPanel(tab?: chrome.tabs.Tab) {
  if (tab?.windowId !== undefined) await chrome.sidePanel.open({ windowId: tab.windowId });
}

async function storeRemoteGarment(
  src: string,
  metadata?: ProductMetadata,
  sourcePageUrl?: string,
): Promise<void> {
  try {
    const localFixture = src.startsWith(chrome.runtime.getURL('fixture/'));
    if (!/^https?:/i.test(src) && !src.startsWith('data:') && !localFixture) {
      throw new Error('Protected or temporary image URLs cannot be copied safely.');
    }
    const response = await fetch(src, { credentials: 'include' });
    if (!response.ok) throw new Error('The shopping site did not allow access to this image.');
    const blob = await response.blob();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
      throw new Error('This page image format is not supported.');
    }
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('The selected image is larger than 10 MB.');
    const bitmap = await createImageBitmap(blob);
    if (!bitmap.width || !bitmap.height)
      throw new Error('The selected image could not be decoded.');
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    const storedImage = {
      slot: 'garment',
      blob,
      name: 'selected-garment',
      mime: blob.type,
      width,
      height,
      updatedAt: Date.now(),
    } as const;
    await saveImage(storedImage);
    const draft = await createCaptureDraft({
      image: storedImage,
      sourceImageUrl: src,
      sourcePageUrl: metadata?.sourceUrl ?? sourcePageUrl,
      metadata,
    });
    await chrome.storage.local.set({ garmentSelectionError: '' });
    await chrome.runtime.sendMessage({
      type: 'GARMENT_BYTES',
      dataUrl: '',
      sourceUrl: src,
      draftId: draft.id,
      metadata,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Could not copy this image.';
    await chrome.storage.local.set({ garmentSelectionError: reason });
    await chrome.runtime.sendMessage({ type: 'GARMENT_FETCH_FAILED', reason });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  await openPanel(tab);
  await storeRemoteGarment(info.srcUrl, undefined, info.pageUrl ?? tab?.url);
});

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const parsed = extensionMessageSchema.safeParse(raw);
  if (!parsed.success) return false;
  if (parsed.data.type === 'OPEN_PICKER') {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const localFixture = tab?.url === chrome.runtime.getURL('fixture.html');
      if (!tab?.id || !tab.url || (!/^https?:/i.test(tab.url) && !localFixture)) {
        sendResponse({
          ok: false,
          error: 'Open a regular shopping page before selecting a garment.',
        });
        return;
      }
      try {
        if (!localFixture) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
        }
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PICKER' });
        sendResponse({ ok: true });
      } catch {
        sendResponse({
          ok: false,
          error: 'Chrome could not activate selection on this page. Use the upload option instead.',
        });
      }
    })();
    return true;
  }
  if (parsed.data.type === 'GARMENT_SELECTED') {
    void storeRemoteGarment(parsed.data.image.src, parsed.data.metadata);
    sendResponse({ ok: true });
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
