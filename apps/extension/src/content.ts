import { extensionMessageSchema } from '@virtual-try-on/shared';
import { startGarmentPicker } from './picker';

declare global {
  interface Window {
    __virtualTryOnPickerCleanup?: () => void;
    __virtualTryOnContentReady?: boolean;
  }
}

if (!window.__virtualTryOnContentReady) {
  window.__virtualTryOnContentReady = true;
  chrome.runtime.onMessage.addListener((raw) => {
    const parsed = extensionMessageSchema.safeParse(raw);
    if (!parsed.success || parsed.data.type !== 'OPEN_PICKER') return;
    window.__virtualTryOnPickerCleanup?.();
    window.__virtualTryOnPickerCleanup = startGarmentPicker((image, metadata) => {
      void chrome.runtime.sendMessage({ type: 'GARMENT_SELECTED', image, metadata });
      window.__virtualTryOnPickerCleanup = undefined;
    });
  });
}
