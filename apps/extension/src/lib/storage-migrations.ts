import { openDatabase } from './database';
import type { QueueAsset, QueueItem } from './database';

const LEGACY_GARMENT_MIGRATION = 'migration:legacy-garment-to-queue:v2';
const LEGACY_PERSON_MIGRATION = 'migration:legacy-person-to-profile:v5';

export type LegacyGarmentMigrationResult =
  | { status: 'migrated'; queueItemId: string }
  | { status: 'already-migrated'; queueItemId?: string }
  | { status: 'nothing-to-migrate' };

export type LegacyPersonMigrationResult =
  | { status: 'migrated'; profileId: string }
  | { status: 'already-migrated'; profileId?: string }
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

export async function migrateLegacyPersonToProfile(): Promise<LegacyPersonMigrationResult> {
  const database = await openDatabase();
  const transaction = database.transaction(['images', 'bodyProfiles', 'metadata'], 'readwrite');
  const metadataStore = transaction.objectStore('metadata');
  const completed = await metadataStore.get(LEGACY_PERSON_MIGRATION);
  if (completed) {
    await transaction.done;
    const value = completed.value as { profileId?: string } | undefined;
    return { status: 'already-migrated', profileId: value?.profileId };
  }
  const existingProfiles = await transaction.objectStore('bodyProfiles').count();
  const legacyPerson = await transaction.objectStore('images').get('person');
  if (!legacyPerson || existingProfiles > 0) {
    await metadataStore.put({
      key: LEGACY_PERSON_MIGRATION,
      value: { completedAt: Date.now() },
    });
    await transaction.done;
    return { status: 'nothing-to-migrate' };
  }
  const now = Date.now();
  const profileId = createId('profile');
  await Promise.all([
    transaction.objectStore('bodyProfiles').add({
      id: profileId,
      profileName: 'Default profile',
      description: 'Migrated saved body photo',
      blob: legacyPerson.blob,
      imageName: legacyPerson.name,
      mime: legacyPerson.mime,
      width: legacyPerson.width,
      height: legacyPerson.height,
      createdAt: legacyPerson.updatedAt || now,
      updatedAt: legacyPerson.updatedAt || now,
      isDefault: true,
    }),
    metadataStore.put({
      key: LEGACY_PERSON_MIGRATION,
      value: { completedAt: now, profileId },
    }),
  ]);
  await transaction.done;
  return { status: 'migrated', profileId };
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
