import { extensionMessageSchema } from '@virtual-try-on/shared';
import { getPageImageDetails, startGarmentPicker } from './picker';

declare global {
  interface Window {
    __virtualTryOnPickerCleanup?: () => void;
    __virtualTryOnContentReady?: boolean;
  }
}

if (!window.__virtualTryOnContentReady) {
  window.__virtualTryOnContentReady = true;
  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const parsed = extensionMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    if (parsed.data.type === 'GET_CONTEXT_IMAGE_DETAILS') {
      sendResponse(getPageImageDetails(document, parsed.data.src));
      return;
    }
    if (parsed.data.type !== 'OPEN_PICKER') return;
    window.__virtualTryOnPickerCleanup?.();
    window.__virtualTryOnPickerCleanup = startGarmentPicker((image, metadata, capture) => {
      void chrome.runtime
        .sendMessage({ type: 'GARMENT_SELECTED', image, metadata, capture })
        .catch(() => undefined);
      window.__virtualTryOnPickerCleanup = undefined;
    });
  });
}
