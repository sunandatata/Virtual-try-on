import { openDatabase } from './database';
import type { QueueItem } from './database';

const COMPARISON_STATE_KEY = 'comparison:state:v1';

export type ComparisonState = {
  selectedIds: string[];
  updatedAt: number;
};

function emptyState(): ComparisonState {
  return { selectedIds: [], updatedAt: 0 };
}

export async function getComparisonState(): Promise<ComparisonState> {
  const stored = await (await openDatabase()).get('metadata', COMPARISON_STATE_KEY);
  if (!stored || !stored.value || typeof stored.value !== 'object') return emptyState();
  const value = stored.value as Partial<ComparisonState>;
  return Array.isArray(value.selectedIds)
    ? {
        selectedIds: value.selectedIds.filter((id): id is string => typeof id === 'string'),
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
      }
    : emptyState();
}

export async function setComparisonSelection(
  selectedIds: string[],
  now = Date.now(),
): Promise<ComparisonState> {
  const uniqueIds = [...new Set(selectedIds)];
  if (uniqueIds.length !== selectedIds.length) {
    throw new Error('Comparison selection cannot contain duplicate items.');
  }
  if (uniqueIds.length > 4) throw new Error('Compare no more than four items.');

  const database = await openDatabase();
  const transaction = database.transaction(['queueItems', 'metadata'], 'readwrite');
  const items = await Promise.all(
    uniqueIds.map((id) => transaction.objectStore('queueItems').get(id)),
  );
  if (items.some((item) => !item || item.status !== 'completed' || !item.resultAssetId)) {
    throw new Error('Only completed try-on results can be compared.');
  }
  const state = { selectedIds: uniqueIds, updatedAt: now };
  await transaction.objectStore('metadata').put({ key: COMPARISON_STATE_KEY, value: state });
  await transaction.done;
  return state;
}

export async function listComparisonItems(): Promise<QueueItem[]> {
  const state = await getComparisonState();
  const database = await openDatabase();
  const items = await Promise.all(state.selectedIds.map((id) => database.get('queueItems', id)));
  return items.filter((item): item is QueueItem => Boolean(item));
}

export async function setComparisonItemNotes(id: string, notes: string): Promise<QueueItem> {
  const database = await openDatabase();
  const transaction = database.transaction('queueItems', 'readwrite');
  const item = await transaction.store.get(id);
  if (!item) throw new Error('Comparison item not found.');
  const next = { ...item, notes: notes.slice(0, 2000), updatedAt: Date.now() };
  await transaction.store.put(next);
  await transaction.done;
  return next;
}

export async function rankComparisonItems(
  orderedIds: string[],
  winnerId?: string,
): Promise<QueueItem[]> {
  const state = await getComparisonState();
  if (
    orderedIds.length < 2 ||
    orderedIds.length > 4 ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !state.selectedIds.includes(id)) ||
    state.selectedIds.some((id) => !orderedIds.includes(id))
  ) {
    throw new Error('Ranking must include every selected comparison item exactly once.');
  }
  if (winnerId && !orderedIds.includes(winnerId)) {
    throw new Error('The winner must be one of the compared items.');
  }

  const database = await openDatabase();
  const transaction = database.transaction('queueItems', 'readwrite');
  const current = await Promise.all(orderedIds.map((id) => transaction.store.get(id)));
  if (current.some((item) => !item)) throw new Error('Comparison item not found.');
  const now = Date.now();
  const ranked = (current as QueueItem[]).map((item) => ({
    ...item,
    rank: orderedIds.indexOf(item.id) + 1,
    winner: item.id === winnerId,
    updatedAt: now,
  }));
  await Promise.all(ranked.map((item) => transaction.store.put(item)));
  await transaction.done;
  return ranked;
}
