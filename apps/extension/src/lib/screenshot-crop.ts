import type { PickerCapture } from '@virtual-try-on/shared';

export type ScreenshotDimensions = { width: number; height: number };
export type PixelCrop = { x: number; y: number; width: number; height: number };

export function calculateScreenshotCrop(
  capture: PickerCapture,
  screenshot: ScreenshotDimensions,
): PixelCrop {
  const { rect, viewport } = capture;
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x + rect.width > viewport.width ||
    rect.y + rect.height > viewport.height
  ) {
    throw new Error('Bring the full product image into view before selecting it.');
  }
  if (
    !Number.isFinite(screenshot.width) ||
    !Number.isFinite(screenshot.height) ||
    screenshot.width <= 0 ||
    screenshot.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new Error('The visible page screenshot has invalid dimensions.');
  }

  // Chrome screenshot pixel dimensions vary with device scale and browser zoom.
  const scaleX = screenshot.width / viewport.width;
  const scaleY = screenshot.height / viewport.height;
  const x = Math.max(0, Math.floor(rect.x * scaleX));
  const y = Math.max(0, Math.floor(rect.y * scaleY));
  const right = Math.min(screenshot.width, Math.ceil((rect.x + rect.width) * scaleX));
  const bottom = Math.min(screenshot.height, Math.ceil((rect.y + rect.height) * scaleY));
  const width = right - x;
  const height = bottom - y;
  if (width < 1 || height < 1) throw new Error('The selected product image is too small to crop.');
  return { x, y, width, height };
}

export async function captureVisibleTabCrop(
  windowId: number,
  capture: PickerCapture,
  captureVisibleTab: typeof chrome.tabs.captureVisibleTab = chrome.tabs.captureVisibleTab,
): Promise<Blob> {
  const screenshotUrl = await captureVisibleTab(windowId, { format: 'png' });
  const screenshotBlob = await (await fetch(screenshotUrl)).blob();
  const bitmap = await createImageBitmap(screenshotBlob);
  try {
    const crop = calculateScreenshotCrop(capture, bitmap);
    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare a cropped product image.');
    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
