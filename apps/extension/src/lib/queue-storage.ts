import { openDatabase } from './database';
import type {
  CaptureDraft,
  QueueAsset,
  QueueAssetKind,
  QueueItem,
  QueueJob,
  QueueStatus,
} from './database';

export type {
  CaptureDraft,
  QueueAsset,
  QueueAssetKind,
  QueueItem,
  QueueJob,
  QueueJobStatus,
  QueueStatus,
} from './database';

type QueueAssetInput = Omit<QueueAsset, 'id' | 'ownerId' | 'kind' | 'createdAt' | 'updatedAt'>;

export type CreateQueueItemInput = Pick<
  QueueItem,
  | 'productName'
  | 'store'
  | 'sourceUrl'
  | 'displayedPrice'
  | 'color'
  | 'category'
  | 'imageFingerprint'
  | 'duplicateKey'
  | 'duplicateOverrideOf'
> & {
  garment: QueueAssetInput;
  now?: number;
};

export type CommitCaptureDraftInput = Pick<
  QueueItem,
  'productName' | 'store' | 'displayedPrice' | 'color'
> & {
  draftId: string;
  category: NonNullable<QueueItem['category']>;
  duplicateOverrideOf?: string;
  now?: number;
};

function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function idleJob(now: number): QueueJob {
  return { status: 'idle', attemptCount: 0, updatedAt: now };
}

function statusForCategory(category: QueueItem['category']): QueueStatus {
  return category ? 'ready' : 'saved';
}

export async function createQueueItem(input: CreateQueueItemInput): Promise<QueueItem> {
  const database = await openDatabase();
  const transaction = database.transaction(['queueItems', 'assets'], 'readwrite');
  const queueStore = transaction.objectStore('queueItems');
  const cursor = await queueStore.index('by-sort-index').openCursor(null, 'prev');
  const now = input.now ?? Date.now();
  const itemId = createId('queue');
  const garmentAssetId = createId('asset');
  const item: QueueItem = {
    id: itemId,
    garmentAssetId,
    productName: input.productName,
    store: input.store,
    sourceUrl: input.sourceUrl,
    displayedPrice: input.displayedPrice,
    color: input.color,
    category: input.category,
    addedAt: now,
    updatedAt: now,
    sortIndex: (cursor?.value.sortIndex ?? -1) + 1,
    status: statusForCategory(input.category),
    job: idleJob(now),
    favorite: false,
    collectionIds: [],
    notes: '',
    winner: false,
    imageFingerprint: input.imageFingerprint,
    duplicateKey: input.duplicateKey,
    duplicateOverrideOf: input.duplicateOverrideOf,
  };
  const asset: QueueAsset = {
    ...input.garment,
    id: garmentAssetId,
    ownerId: itemId,
    kind: 'garment',
    createdAt: now,
    updatedAt: now,
  };
  await Promise.all([queueStore.add(item), transaction.objectStore('assets').add(asset)]);
  await transaction.done;
  return item;
}

export async function commitCaptureDraft(input: CommitCaptureDraftInput): Promise<QueueItem> {
  const database = await openDatabase();
  const transaction = database.transaction(['captureDrafts', 'queueItems', 'assets'], 'readwrite');
  const draft = await transaction.objectStore('captureDrafts').get(input.draftId);
  if (!draft) throw new Error('Capture draft not found.');

  const queueStore = transaction.objectStore('queueItems');
  const duplicateCandidates = await queueStore.index('by-duplicate-key').getAll(draft.duplicateKey);
  if (duplicateCandidates.length > 0) {
    const confirmed = duplicateCandidates.some(
      (candidate) => candidate.id === input.duplicateOverrideOf,
    );
    if (!confirmed) throw new Error('Duplicate queue item requires confirmation.');
  }

  const now = input.now ?? Date.now();
  const id = createId('queue');
  const garmentAssetId = createId('asset');
  const lastItem = await queueStore.index('by-sort-index').openCursor(null, 'prev');
  const item: QueueItem = {
    id,
    garmentAssetId,
    productName: input.productName,
    store: input.store,
    sourceUrl: draft.sourcePageUrl,
    displayedPrice: input.displayedPrice,
    color: input.color,
    category: input.category,
    addedAt: now,
    updatedAt: now,
    sortIndex: (lastItem?.value.sortIndex ?? -1) + 1,
    status: 'ready',
    job: idleJob(now),
    favorite: false,
    collectionIds: [],
    notes: '',
    winner: false,
    imageFingerprint: draft.imageFingerprint,
    duplicateKey: draft.duplicateKey,
    duplicateOverrideOf: input.duplicateOverrideOf,
  };
  const asset: QueueAsset = {
    id: garmentAssetId,
    ownerId: id,
    kind: 'garment',
    blob: draft.blob,
    name: draft.name,
    mime: draft.mime,
    width: draft.width,
    height: draft.height,
    createdAt: draft.createdAt,
    updatedAt: now,
  };
  await Promise.all([
    queueStore.add(item),
    transaction.objectStore('assets').add(asset),
    transaction.objectStore('captureDrafts').delete(draft.id),
  ]);
  await transaction.done;
  return item;
}

export async function getQueueItem(id: string): Promise<QueueItem | undefined> {
  return (await openDatabase()).get('queueItems', id);
}

export async function listQueueItems(): Promise<QueueItem[]> {
  return (await openDatabase()).getAllFromIndex('queueItems', 'by-sort-index');
}

export async function listQueueItemsByStatus(status: QueueStatus): Promise<QueueItem[]> {
  return (await openDatabase()).getAllFromIndex('queueItems', 'by-status', status);
}

export async function updateQueueItem(
  id: string,
  update: (current: QueueItem) => QueueItem,
): Promise<QueueItem> {
  const database = await openDatabase();
  const transaction = database.transaction('queueItems', 'readwrite');
  const current = await transaction.store.get(id);
  if (!current) throw new Error('Queue item not found.');
  const next = update(current);
  if (next.id !== current.id || next.garmentAssetId !== current.garmentAssetId) {
    throw new Error('Queue item identity cannot be changed.');
  }
  const stored = { ...next, updatedAt: Date.now() };
  await transaction.store.put(stored);
  await transaction.done;
  return stored;
}

export async function deleteQueueItem(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(['queueItems', 'assets'], 'readwrite');
  const assetKeys = await transaction.objectStore('assets').index('by-owner').getAllKeys(id);
  await Promise.all([
    transaction.objectStore('queueItems').delete(id),
    ...assetKeys.map((key) => transaction.objectStore('assets').delete(key)),
  ]);
  await transaction.done;
}

export async function replaceQueueOrder(ids: string[]): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('queueItems', 'readwrite');
  const current = await transaction.store.getAll();
  const currentIds = new Set(current.map((item) => item.id));
  if (ids.length !== current.length || ids.some((id) => !currentIds.has(id))) {
    throw new Error('Queue order must include every saved item exactly once.');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('Queue order cannot contain duplicate items.');
  }
  const now = Date.now();
  await Promise.all(
    ids.map(async (id, sortIndex) => {
      const item = current.find((candidate) => candidate.id === id);
      if (!item) return;
      await transaction.store.put({ ...item, sortIndex, updatedAt: now });
    }),
  );
  await transaction.done;
}

export async function findDuplicateQueueItems(duplicateKey: string): Promise<QueueItem[]> {
  return (await openDatabase()).getAllFromIndex('queueItems', 'by-duplicate-key', duplicateKey);
}

export async function setQueueItemFavorite(id: string, favorite: boolean): Promise<QueueItem> {
  return updateQueueItem(id, (item) => ({ ...item, favorite }));
}

export async function resetQueueItemForRetry(id: string): Promise<QueueItem> {
  return updateQueueItem(id, (item) => {
    if (item.status !== 'failed') throw new Error('Only failed queue items can be retried.');
    const now = Date.now();
    return {
      ...item,
      status: item.category ? 'ready' : 'saved',
      job: { status: 'idle', attemptCount: item.job.attemptCount, updatedAt: now },
    };
  });
}

export async function saveQueueResult(
  itemId: string,
  result: QueueAssetInput,
  options?: { isDemo?: boolean; provider?: 'mock' | 'fashn' },
): Promise<QueueItem> {
  const database = await openDatabase();
  const transaction = database.transaction(['queueItems', 'assets'], 'readwrite');
  const queueStore = transaction.objectStore('queueItems');
  const item = await queueStore.get(itemId);
  if (!item) throw new Error('Queue item not found.');
  const existing = await transaction
    .objectStore('assets')
    .index('by-owner-kind')
    .getKey([itemId, 'result']);
  const now = Date.now();
  const resultAssetId = typeof existing === 'string' ? existing : createId('asset');
  const asset: QueueAsset = {
    ...result,
    id: resultAssetId,
    ownerId: itemId,
    kind: 'result',
    createdAt: now,
    updatedAt: now,
  };
  const isDemo =
    options?.isDemo ??
    item.job.isDemo ??
    (options?.provider === 'mock' || item.job.provider === 'mock' || result.name.endsWith('.svg'));
  const next: QueueItem = {
    ...item,
    resultAssetId,
    status: 'completed',
    job: {
      ...item.job,
      status: 'succeeded',
      provider: options?.provider ?? item.job.provider,
      isDemo,
      updatedAt: now,
      lastError: undefined,
    },
    updatedAt: now,
  };
  await Promise.all([transaction.objectStore('assets').put(asset), queueStore.put(next)]);
  await transaction.done;
  return next;
}

export async function getQueueAsset(id: string): Promise<QueueAsset | undefined> {
  return (await openDatabase()).get('assets', id);
}

export async function getQueueAssetByKind(
  itemId: string,
  kind: QueueAssetKind,
): Promise<QueueAsset | undefined> {
  return (await openDatabase()).getFromIndex('assets', 'by-owner-kind', [itemId, kind]);
}

export async function saveCaptureDraft(draft: CaptureDraft): Promise<void> {
  await (await openDatabase()).put('captureDrafts', draft);
}

export async function getCaptureDraft(id: string): Promise<CaptureDraft | undefined> {
  return (await openDatabase()).get('captureDrafts', id);
}

export async function getLatestCaptureDraft(): Promise<CaptureDraft | undefined> {
  const cursor = await (
    await openDatabase()
  )
    .transaction('captureDrafts')
    .store.index('by-created-at')
    .openCursor(null, 'prev');
  return cursor?.value;
}

export async function deleteCaptureDraft(id: string): Promise<void> {
  await (await openDatabase()).delete('captureDrafts', id);
}
