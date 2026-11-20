import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@virtual-try-on/shared';
import type { PickerCapture } from '@virtual-try-on/shared';
import { captureVisibleTabCrop } from './screenshot-crop';

export type LoadedGarmentImage = {
  blob: Blob;
  width: number;
  height: number;
  captureMethod: 'direct-image' | 'screenshot-crop';
};

type LoadGarmentImageInput = {
  src: string;
  capture?: PickerCapture;
  windowId?: number;
  fetcher?: typeof fetch;
  cropper?: (windowId: number, capture: PickerCapture) => Promise<Blob>;
};

async function inspect(blob: Blob): Promise<{ width: number; height: number }> {
  if (!IMAGE_MIME_TYPES.includes(blob.type as (typeof IMAGE_MIME_TYPES)[number])) {
    throw new Error('This page image format is not supported.');
  }
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('The selected image is larger than 10 MB.');
  const bitmap = await createImageBitmap(blob);
  try {
    if (!bitmap.width || !bitmap.height)
      throw new Error('The selected image could not be decoded.');
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function loadGarmentImage(input: LoadGarmentImageInput): Promise<LoadedGarmentImage> {
  const fetcher = input.fetcher ?? fetch;
  let directError: Error;
  try {
    const url = new URL(input.src);
    if (!['http:', 'https:', 'data:', 'blob:', 'chrome-extension:'].includes(url.protocol)) {
      throw new Error('This image URL is protected or temporary.');
    }
    const response = await fetcher(input.src, { credentials: 'omit' });
    if (!response.ok)
      throw new Error('The shopping site did not allow direct access to this image.');
    const blob = await response.blob();
    const dimensions = await inspect(blob);
    return { blob, ...dimensions, captureMethod: 'direct-image' };
  } catch (error) {
    directError =
      error instanceof Error ? error : new Error('Could not read image bytes directly.');
  }

  if (!input.capture || input.windowId === undefined) throw directError;
  try {
    const cropper = input.cropper ?? captureVisibleTabCrop;
    const blob = await cropper(input.windowId, input.capture);
    const dimensions = await inspect(blob);
    return { blob, ...dimensions, captureMethod: 'screenshot-crop' };
  } catch (error) {
    const fallbackError = error instanceof Error ? error.message : 'The screenshot crop failed.';
    throw new Error(`${directError.message} ${fallbackError}`);
  }
}
