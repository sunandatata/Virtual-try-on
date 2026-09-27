export type ImageSlot = 'person' | 'garment' | 'result';

export type StoredImage = {
  slot: ImageSlot;
  blob: Blob;
  name: string;
  mime: string;
  width: number;
  height: number;
  updatedAt: number;
};

const DB_NAME = 'virtual-try-on';
const DB_VERSION = 1;
const STORE = 'images';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'slot' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local image storage.'));
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local storage operation failed.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error('Local storage transaction failed.'));
  });
}

export const saveImage = (image: StoredImage) =>
  transaction('readwrite', (store) => store.put(image));
export const getImage = (slot: ImageSlot) =>
  transaction<StoredImage | undefined>('readonly', (store) => store.get(slot));
export const deleteImage = (slot: ImageSlot) =>
  transaction('readwrite', (store) => store.delete(slot));
export const clearImages = () => transaction('readwrite', (store) => store.clear());

export async function clearAllLocalData(): Promise<void> {
  await clearImages();
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await Promise.all([chrome.storage.local.clear(), chrome.storage.session?.clear()]);
  }
}
