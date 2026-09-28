import type { GarmentCategory, ProductMetadata } from '@virtual-try-on/shared';
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

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

export type QueueStatus = 'saved' | 'ready' | 'generating' | 'completed' | 'failed';
export type QueueJobStatus =
  'idle' | 'queued' | 'submitting' | 'processing' | 'succeeded' | 'failed';

export type QueueJob = {
  status: QueueJobStatus;
  attemptCount: number;
  provider?: 'mock' | 'fashn';
  jobToken?: string;
  lastError?: {
    code?: string;
    message: string;
    retryable: boolean;
    at: number;
  };
  updatedAt: number;
};

export type QueueItem = {
  id: string;
  garmentAssetId: string;
  resultAssetId?: string;
  productName: string;
  store: string;
  sourceUrl?: string;
  displayedPrice?: string;
  color?: string;
  category: GarmentCategory | null;
  addedAt: number;
  updatedAt: number;
  sortIndex: number;
  status: QueueStatus;
  job: QueueJob;
  favorite: boolean;
  collectionIds: string[];
  notes: string;
  rank?: number;
  winner: boolean;
  imageFingerprint: string;
  duplicateKey: string;
  duplicateOverrideOf?: string;
};

export type QueueAssetKind = 'garment' | 'result';

export type QueueAsset = {
  id: string;
  ownerId: string;
  kind: QueueAssetKind;
  blob: Blob;
  name: string;
  mime: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
};

export type CaptureDraft = {
  id: string;
  blob: Blob;
  name: string;
  mime: string;
  width: number;
  height: number;
  sourceImageUrl?: string;
  sourcePageUrl?: string;
  productName: string;
  store: string;
  displayedPrice?: string;
  color?: string;
  category: GarmentCategory | null;
  imageFingerprint: string;
  duplicateKey: string;
  metadata?: ProductMetadata;
  createdAt: number;
  updatedAt: number;
};

export type DatabaseMetadata = {
  key: string;
  value: unknown;
};

export type BatchStatus = 'queued' | 'running' | 'completed' | 'completed-with-errors';

export type GenerationBatch = {
  id: string;
  itemIds: string[];
  status: BatchStatus;
  currentItemId?: string;
  completedItemIds: string[];
  failedItemIds: string[];
  personImageUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
};

interface VirtualTryOnDatabase extends DBSchema {
  images: {
    key: ImageSlot;
    value: StoredImage;
  };
  queueItems: {
    key: string;
    value: QueueItem;
    indexes: {
      'by-sort-index': number;
      'by-status': QueueStatus;
      'by-duplicate-key': string;
    };
  };
  assets: {
    key: string;
    value: QueueAsset;
    indexes: {
      'by-owner': string;
      'by-owner-kind': [string, QueueAssetKind];
    };
  };
  captureDrafts: {
    key: string;
    value: CaptureDraft;
    indexes: {
      'by-created-at': number;
    };
  };
  metadata: {
    key: string;
    value: DatabaseMetadata;
  };
  batches: {
    key: string;
    value: GenerationBatch;
    indexes: {
      'by-created-at': number;
      'by-status': BatchStatus;
    };
  };
}

export const DATABASE_NAME = 'virtual-try-on';
export const DATABASE_VERSION = 3;

let databasePromise: Promise<IDBPDatabase<VirtualTryOnDatabase>> | undefined;

export function openDatabase(): Promise<IDBPDatabase<VirtualTryOnDatabase>> {
  databasePromise ??= openDB<VirtualTryOnDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('images')) {
        database.createObjectStore('images', { keyPath: 'slot' });
      }
      if (!database.objectStoreNames.contains('queueItems')) {
        const queue = database.createObjectStore('queueItems', { keyPath: 'id' });
        queue.createIndex('by-sort-index', 'sortIndex');
        queue.createIndex('by-status', 'status');
        queue.createIndex('by-duplicate-key', 'duplicateKey');
      }
      if (!database.objectStoreNames.contains('assets')) {
        const assets = database.createObjectStore('assets', { keyPath: 'id' });
        assets.createIndex('by-owner', 'ownerId');
        assets.createIndex('by-owner-kind', ['ownerId', 'kind'], { unique: true });
      }
      if (!database.objectStoreNames.contains('captureDrafts')) {
        const drafts = database.createObjectStore('captureDrafts', { keyPath: 'id' });
        drafts.createIndex('by-created-at', 'createdAt');
      }
      if (!database.objectStoreNames.contains('metadata')) {
        database.createObjectStore('metadata', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('batches')) {
        const batches = database.createObjectStore('batches', { keyPath: 'id' });
        batches.createIndex('by-created-at', 'createdAt');
        batches.createIndex('by-status', 'status');
      }
    },
    blocking() {
      databasePromise?.then((database) => database.close()).catch(() => undefined);
      databasePromise = undefined;
    },
  });
  return databasePromise;
}

export async function resetDatabaseConnectionForTests(): Promise<void> {
  if (!databasePromise) return;
  const database = await databasePromise;
  database.close();
  databasePromise = undefined;
}
