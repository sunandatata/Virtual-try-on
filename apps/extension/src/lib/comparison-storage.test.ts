import { beforeEach, describe, expect, it } from 'vitest';
import {
  getComparisonState,
  listComparisonItems,
  rankComparisonItems,
  setComparisonItemNotes,
  setComparisonSelection,
} from './comparison-storage';
import { createQueueItem, saveQueueResult } from './queue-storage';
import type { CreateQueueItemInput, QueueItem } from './queue-storage';
import { clearAllLocalData } from './storage';

function input(index: number): CreateQueueItemInput {
  return {
    productName: `Garment ${index}`,
    store: `Store ${index}`,
    category: 'dress',
    imageFingerprint: `image-${index}`,
    duplicateKey: `duplicate-${index}`,
    garment: {
      blob: new Blob([`garment-${index}`]),
      name: `${index}.png`,
      mime: 'image/png',
      width: 600,
      height: 900,
    },
    now: index,
  };
}

async function completedItem(index: number): Promise<QueueItem> {
  const item = await createQueueItem(input(index));
  return saveQueueResult(item.id, {
    blob: new Blob([`result-${index}`]),
    name: `result-${index}.png`,
    mime: 'image/png',
    width: 600,
    height: 900,
  });
}

describe('comparison persistence', () => {
  beforeEach(clearAllLocalData);

  it('persists two to four completed selections in user order', async () => {
    const first = await completedItem(1);
    const second = await completedItem(2);

    expect(await setComparisonSelection([second.id, first.id], 100)).toEqual({
      selectedIds: [second.id, first.id],
      updatedAt: 100,
    });
    expect((await listComparisonItems()).map((item) => item.id)).toEqual([second.id, first.id]);
    expect(await getComparisonState()).toMatchObject({ selectedIds: [second.id, first.id] });
  });

  it('rejects incomplete, duplicate, and over-limit selections', async () => {
    const incomplete = await createQueueItem(input(1));
    await expect(setComparisonSelection([incomplete.id])).rejects.toThrow(
      'Only completed try-on results',
    );
    const completed = await Promise.all([2, 3, 4, 5, 6].map(completedItem));
    await expect(setComparisonSelection(completed.map((item) => item.id))).rejects.toThrow(
      'no more than four',
    );
    await expect(setComparisonSelection([completed[0]!.id, completed[0]!.id])).rejects.toThrow(
      'cannot contain duplicate',
    );
  });

  it('stores personal notes, rankings, and a winner locally', async () => {
    const first = await completedItem(1);
    const second = await completedItem(2);
    await setComparisonSelection([first.id, second.id]);
    await setComparisonItemNotes(first.id, 'Best color for the wedding.');
    const ranked = await rankComparisonItems([second.id, first.id], second.id);

    expect(ranked).toEqual([
      expect.objectContaining({ id: second.id, rank: 1, winner: true }),
      expect.objectContaining({
        id: first.id,
        rank: 2,
        winner: false,
        notes: 'Best color for the wedding.',
      }),
    ]);
  });

  it('requires a complete ranking and a selected winner', async () => {
    const first = await completedItem(1);
    const second = await completedItem(2);
    const outside = await completedItem(3);
    await setComparisonSelection([first.id, second.id]);

    await expect(rankComparisonItems([first.id])).rejects.toThrow('every selected');
    await expect(rankComparisonItems([first.id, second.id], outside.id)).rejects.toThrow(
      'winner must be one',
    );
  });
});
