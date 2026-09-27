import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@virtual-try-on/shared';
import type { ImageSlot, StoredImage } from './storage';

const MAX_DIMENSION = 2048;
const COMPRESS_THRESHOLD = 5 * 1024 * 1024;

export async function processImage(
  file: Blob,
  slot: ImageSlot,
  name = 'image',
): Promise<StoredImage> {
  if (!IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number])) {
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error('The image must be no larger than 10 MB.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This file is damaged or cannot be decoded as an image.');
  }
  if (!bitmap.width || !bitmap.height) {
    bitmap.close();
    throw new Error('This image has invalid dimensions.');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  let blob = file;
  let mime = file.type;
  if (scale < 1 || file.size > COMPRESS_THRESHOLD) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Could not prepare this image.'))),
        'image/jpeg',
        0.9,
      ),
    );
    mime = 'image/jpeg';
  }
  bitmap.close();
  return { slot, blob, name, mime, width, height, updatedAt: Date.now() };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(blob);
  });
}

export async function imageUrl(image?: StoredImage): Promise<string | undefined> {
  return image ? URL.createObjectURL(image.blob) : undefined;
}
