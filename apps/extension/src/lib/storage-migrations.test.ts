import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_NAME, DATABASE_VERSION, resetDatabaseConnectionForTests } from './database';
import { getQueueAssetByKind, listQueueItems } from './queue-storage';
import { migrateLegacyGarmentToQueue } from './storage-migrations';
import { getImage } from './storage';

async function deleteTestDatabase(): Promise<void> {
  await resetDatabaseConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Test database deletion was blocked.'));
  });
}

async function createVersionOneDatabase(withGarment: boolean): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('images', { keyPath: 'slot' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (!withGarment) {
        request.result.close();
        resolve();
        return;
      }
      const transaction = request.result.transaction('images', 'readwrite');
      transaction.objectStore('images').put({
        slot: 'garment',
        blob: new Blob(['legacy garment'], { type: 'image/png' }),
        name: 'blue-dress.png',
        mime: 'image/png',
        width: 640,
        height: 960,
        updatedAt: 123,
      });
      transaction.oncomplete = () => {
        request.result.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

describe('legacy IndexedDB migration', () => {
  beforeEach(deleteTestDatabase);
  afterEach(deleteTestDatabase);

  it('upgrades the version 1 database and copies a saved garment into the queue once', async () => {
    await createVersionOneDatabase(true);

    const firstRun = await migrateLegacyGarmentToQueue();
    const secondRun = await migrateLegacyGarmentToQueue();
    const items = await listQueueItems();

    expect(DATABASE_VERSION).toBe(3);
    expect(firstRun).toMatchObject({ status: 'migrated', queueItemId: items[0]?.id });
    expect(secondRun).toMatchObject({ status: 'already-migrated', queueItemId: items[0]?.id });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productName: 'blue dress',
      store: 'Store not recorded',
      status: 'saved',
      category: null,
      addedAt: 123,
    });
    expect(await getQueueAssetByKind(items[0]!.id, 'garment')).toMatchObject({
      name: 'blue-dress.png',
      width: 640,
      height: 960,
    });
    expect(await getImage('garment')).toMatchObject({ name: 'blue-dress.png' });
  });

  it('records an empty migration without creating a queue item', async () => {
    await createVersionOneDatabase(false);

    expect(await migrateLegacyGarmentToQueue()).toEqual({ status: 'nothing-to-migrate' });
    expect(await migrateLegacyGarmentToQueue()).toEqual({
      status: 'already-migrated',
      queueItemId: undefined,
    });
    expect(await listQueueItems()).toEqual([]);
  });
});
