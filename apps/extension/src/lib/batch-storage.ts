import { openDatabase } from './database';
import type { GenerationBatch, QueueItem } from './database';

export type { BatchStatus, GenerationBatch } from './database';

const MAX_BATCH_SIZE = 5;

function createId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `batch-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export async function createGenerationBatch(
  itemIds: string[],
  profile: { id: string; imageUpdatedAt: number },
  now = Date.now(),
): Promise<GenerationBatch> {
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length !== itemIds.length) throw new Error('A batch cannot contain duplicates.');
  if (uniqueIds.length < 1 || uniqueIds.length > MAX_BATCH_SIZE) {
    throw new Error(`Choose between 1 and ${MAX_BATCH_SIZE} garments for a batch.`);
  }

  const database = await openDatabase();
  const transaction = database.transaction(['queueItems', 'batches', 'bodyProfiles'], 'readwrite');
  const storedProfile = await transaction.objectStore('bodyProfiles').get(profile.id);
  if (!storedProfile || storedProfile.imageUpdatedAt !== profile.imageUpdatedAt) {
    throw new Error('The selected body profile changed or no longer exists.');
  }
  const queueStore = transaction.objectStore('queueItems');
  const items = await Promise.all(uniqueIds.map((id) => queueStore.get(id)));
  if (items.some((item) => !item)) throw new Error('One or more queue items no longer exist.');
  const queueItems = items as QueueItem[];
  if (queueItems.some((item) => !item.category)) {
    throw new Error('Every selected garment needs a category.');
  }
  if (queueItems.some((item) => !['ready', 'failed'].includes(item.status))) {
    throw new Error('Only ready or failed garments can start a batch.');
  }

  const batches = await transaction.objectStore('batches').getAll();
  const activeItemIds = new Set(
    batches
      .filter((batch) => ['queued', 'running'].includes(batch.status))
      .flatMap((batch) => batch.itemIds),
  );
  if (uniqueIds.some((id) => activeItemIds.has(id))) {
    throw new Error('A selected garment is already in an active batch.');
  }

  const batch: GenerationBatch = {
    id: createId(),
    profileId: profile.id,
    itemIds: uniqueIds,
    status: 'queued',
    completedItemIds: [],
    failedItemIds: [],
    personImageUpdatedAt: profile.imageUpdatedAt,
    createdAt: now,
    updatedAt: now,
  };
  await Promise.all([
    transaction.objectStore('batches').add(batch),
    ...queueItems.map((item) =>
      queueStore.put({
        ...item,
        status: 'generating' as const,
        job: {
          status: 'queued' as const,
          attemptCount: item.job.attemptCount,
          updatedAt: now,
        },
        updatedAt: now,
      }),
    ),
  ]);
  await transaction.done;
  return batch;
}

export async function getGenerationBatch(id: string): Promise<GenerationBatch | undefined> {
  return (await openDatabase()).get('batches', id);
}

export async function listGenerationBatches(): Promise<GenerationBatch[]> {
  return (await openDatabase()).getAllFromIndex('batches', 'by-created-at');
}

export async function getActiveGenerationBatch(): Promise<GenerationBatch | undefined> {
  const database = await openDatabase();
  const [queued, running] = await Promise.all([
    database.getAllFromIndex('batches', 'by-status', 'queued'),
    database.getAllFromIndex('batches', 'by-status', 'running'),
  ]);
  return [...queued, ...running].sort((left, right) => left.createdAt - right.createdAt)[0];
}

export async function updateGenerationBatch(
  id: string,
  update: (current: GenerationBatch) => GenerationBatch,
): Promise<GenerationBatch> {
  const database = await openDatabase();
  const transaction = database.transaction('batches', 'readwrite');
  const current = await transaction.store.get(id);
  if (!current) throw new Error('Generation batch not found.');
  const next = { ...update(current), id: current.id, updatedAt: Date.now() };
  await transaction.store.put(next);
  await transaction.done;
  return next;
}
