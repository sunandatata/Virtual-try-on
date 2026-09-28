import type { ProductMetadata } from '@virtual-try-on/shared';
import type { StoredImage } from './database';
import { saveCaptureDraft } from './queue-storage';
import type { CaptureDraft } from './queue-storage';

export type CreateCaptureDraftInput = {
  image: Omit<StoredImage, 'slot'>;
  sourceImageUrl?: string;
  sourcePageUrl?: string;
  metadata?: ProductMetadata;
  now?: number;
};

function createId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `draft-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function readableName(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim() || 'Saved garment'
  );
}

function normalizedSourceUrl(sourcePageUrl?: string): string | undefined {
  if (!sourcePageUrl) return undefined;
  try {
    const url = new URL(sourcePageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    url.username = '';
    url.password = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

async function fingerprint(blob: Blob): Promise<string> {
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read garment image.'));
    reader.readAsArrayBuffer(blob);
  });
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createCaptureDraft(input: CreateCaptureDraftInput): Promise<CaptureDraft> {
  const now = input.now ?? Date.now();
  const sourcePageUrl = normalizedSourceUrl(input.metadata?.sourceUrl ?? input.sourcePageUrl);
  const imageFingerprint = await fingerprint(input.image.blob);
  const productName = input.metadata?.productName?.value ?? readableName(input.image.name);
  const store =
    input.metadata?.store.value ??
    (sourcePageUrl ? new URL(sourcePageUrl).hostname.replace(/^www\./, '') : 'Manual upload');
  const color = input.metadata?.color?.value;
  const duplicateKey = [
    sourcePageUrl ?? 'manual',
    color?.toLowerCase() ?? '',
    imageFingerprint,
  ].join('|');
  const draft: CaptureDraft = {
    id: createId(),
    blob: input.image.blob,
    name: input.image.name,
    mime: input.image.mime,
    width: input.image.width,
    height: input.image.height,
    sourceImageUrl: input.sourceImageUrl,
    sourcePageUrl,
    productName,
    store,
    displayedPrice: input.metadata?.displayedPrice?.value,
    color,
    category: null,
    imageFingerprint,
    duplicateKey,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };
  await saveCaptureDraft(draft);
  return draft;
}
