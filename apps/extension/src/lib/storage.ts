import { openDatabase } from './database';
import type { ImageSlot, StoredImage } from './database';

export type { ImageSlot, StoredImage } from './database';

export async function saveImage(image: StoredImage) {
  return (await openDatabase()).put('images', image);
}

export async function getImage(slot: ImageSlot) {
  return (await openDatabase()).get('images', slot);
}

export async function deleteImage(slot: ImageSlot) {
  return (await openDatabase()).delete('images', slot);
}

export async function clearImages() {
  return (await openDatabase()).clear('images');
}

export async function clearAllLocalData(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    ['images', 'queueItems', 'assets', 'captureDrafts', 'metadata', 'batches', 'collections'],
    'readwrite',
  );
  await Promise.all([
    transaction.objectStore('images').clear(),
    transaction.objectStore('queueItems').clear(),
    transaction.objectStore('assets').clear(),
    transaction.objectStore('captureDrafts').clear(),
    transaction.objectStore('metadata').clear(),
    transaction.objectStore('batches').clear(),
    transaction.objectStore('collections').clear(),
    transaction.done,
  ]);
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await Promise.all([chrome.storage.local.clear(), chrome.storage.session?.clear()]);
  }
}
