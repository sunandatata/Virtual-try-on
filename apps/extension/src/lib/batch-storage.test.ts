import { beforeEach, describe, expect, it } from 'vitest';
import {
  createGenerationBatch,
  getActiveGenerationBatch,
  getGenerationBatch,
  listGenerationBatches,
  updateGenerationBatch,
} from './batch-storage';
import { createQueueItem, getQueueItem, updateQueueItem } from './queue-storage';
import type { CreateQueueItemInput } from './queue-storage';
import { clearAllLocalData } from './storage';
import { createBodyProfile, deleteBodyProfile } from './body-profile-storage';

let profile: Awaited<ReturnType<typeof createBodyProfile>>;

function queueInput(index: number): CreateQueueItemInput {
  return {
    productName: `Garment ${index}`,
    store: 'Example',
    category: 'dress',
    imageFingerprint: `fingerprint-${index}`,
    duplicateKey: `duplicate-${index}`,
    garment: {
      blob: new Blob([String(index)]),
      name: `${index}.png`,
      mime: 'image/png',
      width: 600,
      height: 900,
    },
    now: index,
  };
}

describe('generation batch storage', () => {
  beforeEach(async () => {
    await clearAllLocalData();
    profile = await createBodyProfile({
      profileName: 'Front',
      image: {
        blob: new Blob(['person']),
        imageName: 'person.png',
        mime: 'image/png',
        width: 800,
        height: 1200,
      },
      now: 99,
    });
  });

  it('atomically queues one to five ready garments in their selected order', async () => {
    const first = await createQueueItem(queueInput(1));
    const second = await createQueueItem(queueInput(2));

    const batch = await createGenerationBatch([second.id, first.id], profile, 100);

    expect(batch).toMatchObject({
      itemIds: [second.id, first.id],
      status: 'queued',
      profileId: profile.id,
      personImageUpdatedAt: 99,
    });
    expect(await getQueueItem(first.id)).toMatchObject({
      status: 'generating',
      job: { status: 'queued', attemptCount: 0 },
    });
    expect(await getActiveGenerationBatch()).toEqual(batch);
  });

  it('rejects duplicates, invalid sizes, missing items, and unready items', async () => {
    const item = await createQueueItem(queueInput(1));
    await expect(createGenerationBatch([], profile)).rejects.toThrow('Choose between 1 and 5');
    await expect(createGenerationBatch([item.id, item.id], profile)).rejects.toThrow(
      'cannot contain duplicates',
    );
    await expect(createGenerationBatch(['missing'], profile)).rejects.toThrow('no longer exist');
    await updateQueueItem(item.id, (current) => ({ ...current, status: 'completed' }));
    await expect(createGenerationBatch([item.id], profile)).rejects.toThrow(
      'Only ready or failed garments',
    );
  });

  it('prevents an item from entering two active batches', async () => {
    const item = await createQueueItem(queueInput(1));
    await createGenerationBatch([item.id], profile, 10);
    await updateQueueItem(item.id, (current) => ({ ...current, status: 'ready' }));

    await expect(createGenerationBatch([item.id], profile, 20)).rejects.toThrow(
      'already in an active batch',
    );
  });

  it('protects the body profile used by an active batch', async () => {
    const item = await createQueueItem(queueInput(1));
    await createGenerationBatch([item.id], profile, 10);

    await expect(deleteBodyProfile(profile.id)).rejects.toThrow(
      'being used by an active generation',
    );
  });

  it('persists progress and exposes the oldest active batch for recovery', async () => {
    const first = await createQueueItem(queueInput(1));
    const batch = await createGenerationBatch([first.id], profile, 10);
    const running = await updateGenerationBatch(batch.id, (current) => ({
      ...current,
      status: 'running',
      currentItemId: first.id,
    }));

    expect(await getGenerationBatch(batch.id)).toEqual(running);
    expect(await listGenerationBatches()).toEqual([running]);
    expect(await getActiveGenerationBatch()).toEqual(running);
  });
});
