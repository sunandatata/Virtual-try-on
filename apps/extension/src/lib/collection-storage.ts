import { openDatabase } from './database';
import type { GarmentCollection, QueueItem } from './database';

export type { GarmentCollection } from './database';

function createId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `collection-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function normalizedName(name: string): string {
  return cleanName(name).toLocaleLowerCase();
}

export async function listCollections(): Promise<GarmentCollection[]> {
  return (await openDatabase()).getAllFromIndex('collections', 'by-created-at');
}

export async function createCollection(name: string, now = Date.now()): Promise<GarmentCollection> {
  const cleaned = cleanName(name);
  if (!cleaned) throw new Error('Collection name is required.');
  const database = await openDatabase();
  const normalized = normalizedName(cleaned);
  if (await database.getFromIndex('collections', 'by-normalized-name', normalized)) {
    throw new Error('A collection with this name already exists.');
  }
  const collection: GarmentCollection = {
    id: createId(),
    name: cleaned,
    normalizedName: normalized,
    createdAt: now,
    updatedAt: now,
  };
  await database.add('collections', collection);
  return collection;
}

export async function renameCollection(id: string, name: string): Promise<GarmentCollection> {
  const cleaned = cleanName(name);
  if (!cleaned) throw new Error('Collection name is required.');
  const database = await openDatabase();
  const transaction = database.transaction('collections', 'readwrite');
  const current = await transaction.store.get(id);
  if (!current) throw new Error('Collection not found.');
  const normalized = normalizedName(cleaned);
  const duplicate = await transaction.store.index('by-normalized-name').get(normalized);
  if (duplicate && duplicate.id !== id) {
    throw new Error('A collection with this name already exists.');
  }
  const updated = { ...current, name: cleaned, normalizedName: normalized, updatedAt: Date.now() };
  await transaction.store.put(updated);
  await transaction.done;
  return updated;
}

export async function deleteCollection(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(['collections', 'queueItems'], 'readwrite');
  if (!(await transaction.objectStore('collections').get(id))) {
    throw new Error('Collection not found.');
  }
  const queueStore = transaction.objectStore('queueItems');
  const items = await queueStore.getAll();
  const now = Date.now();
  await Promise.all([
    transaction.objectStore('collections').delete(id),
    ...items
      .filter((item) => item.collectionIds.includes(id))
      .map((item) =>
        queueStore.put({
          ...item,
          collectionIds: item.collectionIds.filter((collectionId) => collectionId !== id),
          updatedAt: now,
        }),
      ),
  ]);
  await transaction.done;
}

export async function setItemCollectionMembership(
  itemId: string,
  collectionId: string,
  included: boolean,
): Promise<QueueItem> {
  const database = await openDatabase();
  const transaction = database.transaction(['collections', 'queueItems'], 'readwrite');
  const [collection, item] = await Promise.all([
    transaction.objectStore('collections').get(collectionId),
    transaction.objectStore('queueItems').get(itemId),
  ]);
  if (!collection) throw new Error('Collection not found.');
  if (!item) throw new Error('Queue item not found.');
  const ids = new Set(item.collectionIds);
  if (included) ids.add(collectionId);
  else ids.delete(collectionId);
  const updated = { ...item, collectionIds: [...ids], updatedAt: Date.now() };
  await transaction.objectStore('queueItems').put(updated);
  await transaction.done;
  return updated;
}
