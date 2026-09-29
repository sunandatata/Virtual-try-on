import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getComparisonState } from '../lib/comparison-storage';
import { createQueueItem, getQueueItem, saveQueueResult } from '../lib/queue-storage';
import type { CreateQueueItemInput, QueueItem } from '../lib/queue-storage';
import { clearAllLocalData } from '../lib/storage';
import { ComparisonPanel } from './ComparisonPanel';

function input(index: number): CreateQueueItemInput {
  return {
    productName: `Garment ${index}`,
    store: `Store ${index}`,
    sourceUrl: `https://store${index}.example/product`,
    displayedPrice: `$${index}0`,
    color: index === 1 ? 'Blue' : 'Green',
    category: 'dress',
    imageFingerprint: `image-${index}`,
    duplicateKey: `duplicate-${index}`,
    garment: {
      blob: new Blob([`garment-${index}`]),
      name: `garment-${index}.png`,
      mime: 'image/png',
      width: 600,
      height: 900,
    },
    now: index,
  };
}

async function completed(index: number): Promise<QueueItem> {
  const item = await createQueueItem(input(index));
  return saveQueueResult(item.id, {
    blob: new Blob([`result-${index}`]),
    name: `result-${index}.png`,
    mime: 'image/png',
    width: 600,
    height: 900,
  });
}

describe('ComparisonPanel', () => {
  beforeEach(async () => {
    await clearAllLocalData();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:comparison');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('selects, ranks, annotates, and chooses a winner across completed results', async () => {
    const first = await completed(1);
    const second = await completed(2);
    const user = userEvent.setup();
    render(<ComparisonPanel />);

    await user.click(
      await screen.findByRole('checkbox', { name: 'Compare Garment 1 from Store 1' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Compare Garment 2 from Store 2' }));
    const comparison = await screen.findByLabelText('Selected try-on comparison');
    expect(await within(comparison).findByAltText('Garment 1 try-on result')).toBeVisible();
    expect(await within(comparison).findByAltText('Garment 2 garment')).toBeVisible();

    const firstCard = within(comparison).getByText('Garment 1').closest('article')!;
    const notes = within(firstCard).getByLabelText('Personal notes');
    await user.type(notes, 'Great color for the event.');
    await user.tab();
    await waitFor(async () =>
      expect(await getQueueItem(first.id)).toMatchObject({ notes: 'Great color for the event.' }),
    );

    const updatedComparison = await screen.findByLabelText('Selected try-on comparison');
    const secondCard = within(updatedComparison).getByText('Garment 2').closest('article')!;
    await user.click(within(secondCard).getByRole('button', { name: 'Choose winner' }));
    await waitFor(async () =>
      expect(await getQueueItem(second.id)).toMatchObject({ winner: true }),
    );
    expect(await screen.findByText('Winner')).toBeVisible();

    const refreshedComparison = await screen.findByLabelText('Selected try-on comparison');
    const refreshedFirstCard = within(refreshedComparison)
      .getByText('Garment 1')
      .closest('article')!;
    await user.click(within(refreshedFirstCard).getByRole('button', { name: 'Rank lower' }));
    await waitFor(async () =>
      expect((await getComparisonState()).selectedIds).toEqual([second.id, first.id]),
    );
  });

  it('supports source links, downloads, favorites, and removing an item', async () => {
    await completed(1);
    await completed(2);
    const user = userEvent.setup();
    render(<ComparisonPanel />);

    await user.click(
      await screen.findByRole('checkbox', { name: 'Compare Garment 1 from Store 1' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Compare Garment 2 from Store 2' }));
    const comparison = await screen.findByLabelText('Selected try-on comparison');
    const firstCard = within(comparison).getByText('Garment 1').closest('article')!;
    expect(within(firstCard).getByRole('link', { name: 'Return to store' })).toHaveAttribute(
      'href',
      'https://store1.example/product',
    );
    expect(await within(firstCard).findByRole('link', { name: 'Download result' })).toHaveAttribute(
      'download',
      'result-1.png',
    );
    await user.click(within(firstCard).getByRole('button', { name: 'Add to favorites' }));
    expect(await screen.findByRole('button', { name: 'Remove from favorites' })).toBeVisible();
    const refreshedComparison = await screen.findByLabelText('Selected try-on comparison');
    const refreshedFirstCard = within(refreshedComparison)
      .getByText('Garment 1')
      .closest('article')!;
    await user.click(
      within(refreshedFirstCard).getByRole('button', { name: 'Remove from comparison' }),
    );
    expect(await screen.findByText('Select at least two results to compare.')).toBeVisible();
  });

  it('displays a single completed result with simulated demo badge when only one try-on exists', async () => {
    const item = await createQueueItem(input(1));
    await saveQueueResult(
      item.id,
      {
        blob: new Blob(['<svg><text>DEMO RESULT</text></svg>'], { type: 'image/svg+xml' }),
        name: 'demo-result.svg',
        mime: 'image/svg+xml',
        width: 600,
        height: 900,
      },
      { isDemo: true, provider: 'mock' },
    );

    render(<ComparisonPanel />);

    expect(
      await screen.findByText(
        'Complete at least two try-ons to compare side by side. Here is your finished result:',
      ),
    ).toBeVisible();
    expect(await screen.findByText('Simulated · Demo')).toBeVisible();
    expect(await screen.findByAltText('Garment 1 try-on result')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download result' })).toHaveAttribute(
      'download',
      'demo-result.svg',
    );
  });
});
