import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData } from './storage';
import {
  createQueueItem,
  commitCaptureDraft,
  deleteCaptureDraft,
  deleteQueueItem,
  findDuplicateQueueItems,
  getCaptureDraft,
  getLatestCaptureDraft,
  getQueueAsset,
  getQueueAssetByKind,
  getQueueItem,
  listQueueItems,
  listQueueItemsByStatus,
  replaceQueueOrder,
  resetQueueItemForRetry,
  saveCaptureDraft,
  saveQueueResult,
  setQueueItemFavorite,
  updateQueueItem,
} from './queue-storage';
import type { CaptureDraft, CreateQueueItemInput } from './queue-storage';

function queueInput(overrides: Partial<CreateQueueItemInput> = {}): CreateQueueItemInput {
  return {
    productName: 'Linen dress',
    store: 'Example Store',
    sourceUrl: 'https://shop.example/products/linen-dress',
    displayedPrice: '$79.00',
    color: 'Blue',
    category: 'dress',
    imageFingerprint: 'image-fingerprint',
    duplicateKey: 'example|linen-dress|blue|image-fingerprint',
    garment: {
      blob: new Blob(['garment'], { type: 'image/png' }),
      name: 'dress.png',
      mime: 'image/png',
      width: 800,
      height: 1200,
    },
    now: 100,
    ...overrides,
  };
}

describe('try-on queue repository', () => {
  beforeEach(async () => {
    await clearAllLocalData();
  });

  it('creates ordered items and stores garment blobs separately', async () => {
    const first = await createQueueItem(queueInput());
    const second = await createQueueItem(
      queueInput({
        productName: 'Silk blouse',
        duplicateKey: 'example|silk-blouse|ivory|another-image',
        imageFingerprint: 'another-image',
        now: 200,
      }),
    );

    expect(await listQueueItems()).toEqual([first, second]);
    expect(first).toMatchObject({ status: 'ready', sortIndex: 0, favorite: false });
    expect(second.sortIndex).toBe(1);
    expect(await getQueueAsset(first.garmentAssetId)).toMatchObject({
      ownerId: first.id,
      kind: 'garment',
      name: 'dress.png',
    });
  });

  it('uses saved status until a category is known and supports status filtering', async () => {
    const item = await createQueueItem(queueInput({ category: null }));

    expect(item.status).toBe('saved');
    expect(await listQueueItemsByStatus('saved')).toEqual([item]);
    expect(await listQueueItemsByStatus('ready')).toEqual([]);
  });

  it('finds duplicate candidates without blocking intentional variants', async () => {
    const first = await createQueueItem(queueInput());
    const second = await createQueueItem(queueInput({ duplicateOverrideOf: first.id, now: 200 }));

    expect((await findDuplicateQueueItems(first.duplicateKey)).map((item) => item.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(second.duplicateOverrideOf).toBe(first.id);
  });

  it('updates favorites and reorders the complete queue', async () => {
    const first = await createQueueItem(queueInput());
    const second = await createQueueItem(
      queueInput({
        duplicateKey: 'second',
        imageFingerprint: 'second',
        productName: 'Second garment',
        now: 200,
      }),
    );

    expect((await setQueueItemFavorite(first.id, true)).favorite).toBe(true);
    await replaceQueueOrder([second.id, first.id]);
    expect((await listQueueItems()).map((item) => item.id)).toEqual([second.id, first.id]);
    await expect(replaceQueueOrder([first.id])).rejects.toThrow(
      'Queue order must include every saved item exactly once.',
    );
  });

  it('removes all assets when deleting an item', async () => {
    const item = await createQueueItem(queueInput());
    await saveQueueResult(item.id, {
      blob: new Blob(['result'], { type: 'image/png' }),
      name: 'result.png',
      mime: 'image/png',
      width: 800,
      height: 1200,
    });

    await deleteQueueItem(item.id);
    expect(await getQueueItem(item.id)).toBeUndefined();
    expect(await getQueueAssetByKind(item.id, 'garment')).toBeUndefined();
    expect(await getQueueAssetByKind(item.id, 'result')).toBeUndefined();
  });

  it('preserves attempt history while resetting a failed item for retry', async () => {
    const item = await createQueueItem(queueInput());
    await updateQueueItem(item.id, (current) => ({
      ...current,
      status: 'failed',
      job: {
        status: 'failed',
        attemptCount: 2,
        updatedAt: 200,
        lastError: { message: 'Provider timeout', retryable: true, at: 200 },
      },
    }));

    const retried = await resetQueueItemForRetry(item.id);
    expect(retried).toMatchObject({
      status: 'ready',
      job: { status: 'idle', attemptCount: 2 },
    });
    expect(retried.job.lastError).toBeUndefined();
  });

  it('stores and replaces generated results without duplicating assets', async () => {
    const item = await createQueueItem(queueInput());
    const first = await saveQueueResult(item.id, {
      blob: new Blob(['first']),
      name: 'first.png',
      mime: 'image/png',
      width: 100,
      height: 200,
    });
    const second = await saveQueueResult(item.id, {
      blob: new Blob(['second']),
      name: 'second.png',
      mime: 'image/png',
      width: 200,
      height: 400,
    });

    expect(second.resultAssetId).toBe(first.resultAssetId);
    expect(second).toMatchObject({ status: 'completed', job: { status: 'succeeded' } });
    expect(await getQueueAssetByKind(item.id, 'result')).toMatchObject({
      id: first.resultAssetId,
      name: 'second.png',
      width: 200,
    });
  });

  it('round-trips capture drafts and returns the newest draft', async () => {
    const draft = (id: string, createdAt: number): CaptureDraft => ({
      id,
      blob: new Blob([id]),
      name: `${id}.png`,
      mime: 'image/png',
      width: 640,
      height: 960,
      productName: 'Pending garment',
      store: 'Example Store',
      category: null,
      imageFingerprint: id,
      duplicateKey: id,
      createdAt,
      updatedAt: createdAt,
    });
    await saveCaptureDraft(draft('first', 100));
    await saveCaptureDraft(draft('second', 200));

    expect(await getLatestCaptureDraft()).toMatchObject({ id: 'second' });
    expect(await getCaptureDraft('first')).toMatchObject({ id: 'first' });
    await deleteCaptureDraft('first');
    expect(await getCaptureDraft('first')).toBeUndefined();
  });

  it('atomically commits a reviewed capture draft to the ready queue', async () => {
    const draft: CaptureDraft = {
      id: 'review-me',
      blob: new Blob(['reviewed garment'], { type: 'image/png' }),
      name: 'review.png',
      mime: 'image/png',
      width: 700,
      height: 1000,
      sourcePageUrl: 'https://shop.example/review',
      productName: 'Suggested name',
      store: 'Suggested store',
      category: null,
      imageFingerprint: 'review-fingerprint',
      duplicateKey: 'review-duplicate-key',
      createdAt: 100,
      updatedAt: 100,
    };
    await saveCaptureDraft(draft);

    const item = await commitCaptureDraft({
      draftId: draft.id,
      productName: 'Edited name',
      store: 'Edited store',
      displayedPrice: '$55',
      color: 'Green',
      category: 'dress',
      now: 200,
    });

    expect(item).toMatchObject({
      productName: 'Edited name',
      store: 'Edited store',
      sourceUrl: draft.sourcePageUrl,
      displayedPrice: '$55',
      color: 'Green',
      category: 'dress',
      status: 'ready',
    });
    expect(await getCaptureDraft(draft.id)).toBeUndefined();
    expect(await getQueueAssetByKind(item.id, 'garment')).toMatchObject({
      name: 'review.png',
      width: 700,
    });
  });

  it('requires explicit confirmation before committing a duplicate variant', async () => {
    const existing = await createQueueItem(queueInput());
    const draft: CaptureDraft = {
      id: 'duplicate-draft',
      blob: new Blob(['garment'], { type: 'image/png' }),
      name: 'duplicate.png',
      mime: 'image/png',
      width: 800,
      height: 1200,
      productName: 'Duplicate',
      store: 'Example Store',
      category: null,
      imageFingerprint: existing.imageFingerprint,
      duplicateKey: existing.duplicateKey,
      createdAt: 200,
      updatedAt: 200,
    };
    await saveCaptureDraft(draft);
    const reviewed = {
      draftId: draft.id,
      productName: draft.productName,
      store: draft.store,
      category: 'dress' as const,
      now: 300,
    };

    await expect(commitCaptureDraft(reviewed)).rejects.toThrow(
      'Duplicate queue item requires confirmation.',
    );
    expect(await getCaptureDraft(draft.id)).toBeDefined();
    const variant = await commitCaptureDraft({
      ...reviewed,
      duplicateOverrideOf: existing.id,
    });
    expect(variant.duplicateOverrideOf).toBe(existing.id);
  });
});
