import { openDatabase } from './database';
import type { QueueAsset, QueueItem } from './database';

const LEGACY_GARMENT_MIGRATION = 'migration:legacy-garment-to-queue:v2';

export type LegacyGarmentMigrationResult =
  | { status: 'migrated'; queueItemId: string }
  | { status: 'already-migrated'; queueItemId?: string }
  | { status: 'nothing-to-migrate' };

function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function readableLegacyName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  const normalized = withoutExtension.replace(/[-_]+/g, ' ').trim();
  return normalized || 'Saved garment';
}

export async function migrateLegacyGarmentToQueue(): Promise<LegacyGarmentMigrationResult> {
  const database = await openDatabase();
  const transaction = database.transaction(
    ['images', 'queueItems', 'assets', 'metadata'],
    'readwrite',
  );
  const metadataStore = transaction.objectStore('metadata');
  const completed = await metadataStore.get(LEGACY_GARMENT_MIGRATION);
  if (completed) {
    await transaction.done;
    const value = completed.value as { queueItemId?: string } | undefined;
    return { status: 'already-migrated', queueItemId: value?.queueItemId };
  }

  const legacyGarment = await transaction.objectStore('images').get('garment');
  if (!legacyGarment) {
    await metadataStore.put({
      key: LEGACY_GARMENT_MIGRATION,
      value: { completedAt: Date.now() },
    });
    await transaction.done;
    return { status: 'nothing-to-migrate' };
  }

  const duplicateKey = [
    'legacy',
    legacyGarment.name,
    legacyGarment.blob.size,
    legacyGarment.updatedAt,
  ].join(':');
  const existing = await transaction
    .objectStore('queueItems')
    .index('by-duplicate-key')
    .get(duplicateKey);
  if (existing) {
    await metadataStore.put({
      key: LEGACY_GARMENT_MIGRATION,
      value: { completedAt: Date.now(), queueItemId: existing.id },
    });
    await transaction.done;
    return { status: 'already-migrated', queueItemId: existing.id };
  }

  const now = Date.now();
  const queueItemId = createId('queue');
  const garmentAssetId = createId('asset');
  const lastItem = await transaction
    .objectStore('queueItems')
    .index('by-sort-index')
    .openCursor(null, 'prev');
  const queueItem: QueueItem = {
    id: queueItemId,
    garmentAssetId,
    productName: readableLegacyName(legacyGarment.name),
    store: 'Store not recorded',
    category: null,
    addedAt: legacyGarment.updatedAt || now,
    updatedAt: now,
    sortIndex: (lastItem?.value.sortIndex ?? -1) + 1,
    status: 'saved',
    job: { status: 'idle', attemptCount: 0, updatedAt: now },
    favorite: false,
    collectionIds: [],
    notes: '',
    winner: false,
    imageFingerprint: duplicateKey,
    duplicateKey,
  };
  const asset: QueueAsset = {
    id: garmentAssetId,
    ownerId: queueItemId,
    kind: 'garment',
    blob: legacyGarment.blob,
    name: legacyGarment.name,
    mime: legacyGarment.mime,
    width: legacyGarment.width,
    height: legacyGarment.height,
    createdAt: legacyGarment.updatedAt || now,
    updatedAt: now,
  };

  await Promise.all([
    transaction.objectStore('queueItems').add(queueItem),
    transaction.objectStore('assets').add(asset),
    metadataStore.put({
      key: LEGACY_GARMENT_MIGRATION,
      value: { completedAt: now, queueItemId },
    }),
  ]);
  await transaction.done;
  return { status: 'migrated', queueItemId };
}
