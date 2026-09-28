import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCollection,
  deleteCollection,
  listCollections,
  renameCollection,
  setItemCollectionMembership,
} from './collection-storage';
import { createQueueItem, getQueueItem } from './queue-storage';
import { clearAllLocalData } from './storage';

async function queueItem() {
  return createQueueItem({
    productName: 'Linen dress',
    store: 'Example',
    sourceUrl: 'https://example.test/dress',
    displayedPrice: '$80',
    color: 'Blue',
    category: 'dress',
    imageFingerprint: 'dress-image',
    duplicateKey: 'dress-blue',
    garment: {
      blob: new Blob(['dress']),
      name: 'dress.png',
      mime: 'image/png',
      width: 800,
      height: 1200,
    },
  });
}

describe('collection repository', () => {
  beforeEach(clearAllLocalData);

  it('creates, lists, and renames unique local collections', async () => {
    const work = await createCollection('  Work  ', 100);
    const vacation = await createCollection('Vacation', 200);

    expect(await listCollections()).toEqual([work, vacation]);
    expect(await renameCollection(work.id, 'Office')).toMatchObject({
      name: 'Office',
      normalizedName: 'office',
    });
    await expect(createCollection(' office ')).rejects.toThrow('already exists');
  });

  it('adds and removes an item without duplicate membership', async () => {
    const item = await queueItem();
    const collection = await createCollection('Wedding');

    await setItemCollectionMembership(item.id, collection.id, true);
    await setItemCollectionMembership(item.id, collection.id, true);
    expect(await getQueueItem(item.id)).toMatchObject({ collectionIds: [collection.id] });
    await setItemCollectionMembership(item.id, collection.id, false);
    expect(await getQueueItem(item.id)).toMatchObject({ collectionIds: [] });
  });

  it('deletes a collection while preserving its queue items', async () => {
    const item = await queueItem();
    const collection = await createCollection('Casual');
    await setItemCollectionMembership(item.id, collection.id, true);

    await deleteCollection(collection.id);

    expect(await listCollections()).toEqual([]);
    expect(await getQueueItem(item.id)).toMatchObject({ id: item.id, collectionIds: [] });
  });

  it('rejects missing records and blank names', async () => {
    const item = await queueItem();
    await expect(createCollection('   ')).rejects.toThrow('name is required');
    await expect(renameCollection('missing', 'Work')).rejects.toThrow('not found');
    await expect(setItemCollectionMembership(item.id, 'missing', true)).rejects.toThrow(
      'Collection not found',
    );
  });
});
