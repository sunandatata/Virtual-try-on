import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@virtual-try-on/shared';
import sharp, { type Metadata } from 'sharp';

export type ValidImage = { buffer: Buffer; mime: (typeof IMAGE_MIME_TYPES)[number] };

export async function validateImage(value: FormDataEntryValue | null): Promise<ValidImage> {
  if (!(value instanceof File)) throw new Error('An image file is required.');
  if (!IMAGE_MIME_TYPES.includes(value.type as ValidImage['mime'])) {
    throw new Error('Use a JPEG, PNG, or WebP image.');
  }
  if (value.size <= 0 || value.size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be no larger than 10 MB.');
  }
  const buffer = Buffer.from(await value.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw new Error('The image content does not match its file type or cannot be decoded.');
  }
  const expected = value.type === 'image/jpeg' ? 'jpeg' : value.type.split('/')[1];
  if (!metadata.width || !metadata.height || metadata.format !== expected) {
    throw new Error('The image content does not match its file type or cannot be decoded.');
  }
  return { buffer, mime: value.type as ValidImage['mime'] };
}

export function dataUri(image: ValidImage): string {
  return `data:${image.mime};base64,${image.buffer.toString('base64')}`;
}
