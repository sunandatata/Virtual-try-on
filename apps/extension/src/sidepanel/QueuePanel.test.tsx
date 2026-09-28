import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQueueItem,
  getCaptureDraft,
  listQueueItems,
  saveCaptureDraft,
} from '../lib/queue-storage';
import type { CaptureDraft, CreateQueueItemInput } from '../lib/queue-storage';
import { clearAllLocalData, saveImage } from '../lib/storage';
import { QueuePanel } from './QueuePanel';

function draft(overrides: Partial<CaptureDraft> = {}): CaptureDraft {
  return {
    id: 'draft-one',
    blob: new Blob(['draft'], { type: 'image/png' }),
    name: 'draft.png',
    mime: 'image/png',
    width: 600,
    height: 900,
    sourcePageUrl: 'https://shop.example/dress',
    productName: 'Suggested Dress',
    store: 'Example Shop',
    displayedPrice: '$79',
    color: 'Blue',
    category: null,
    imageFingerprint: 'draft-fingerprint',
    duplicateKey: 'draft-key',
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function queueInput(overrides: Partial<CreateQueueItemInput> = {}): CreateQueueItemInput {
  return {
    productName: 'Queue Dress',
    store: 'Queue Shop',
    sourceUrl: 'https://queue.example/dress',
    displayedPrice: '$60',
    color: 'Red',
    category: 'dress',
    imageFingerprint: 'queue-fingerprint',
    duplicateKey: 'queue-key',
    garment: {
      blob: new Blob(['queue'], { type: 'image/png' }),
      name: 'queue.png',
      mime: 'image/png',
      width: 600,
      height: 900,
    },
    now: 100,
    ...overrides,
  };
}

describe('QueuePanel', () => {
  beforeEach(async () => {
    await clearAllLocalData();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requires review and an explicit category before saving a capture draft', async () => {
    await saveCaptureDraft(draft());
    const user = userEvent.setup();
    render(<QueuePanel />);

    expect(await screen.findByRole('heading', { name: 'Confirm garment details' })).toBeVisible();
    const addButton = screen.getByRole('button', { name: 'Add to queue' });
    expect(addButton).toBeDisabled();
    await user.clear(screen.getByLabelText('Product name'));
    await user.type(screen.getByLabelText('Product name'), 'Edited Dress');
    await user.selectOptions(screen.getByLabelText('Garment category'), 'dress');
    await user.click(addButton);

    await waitFor(() =>
      expect(screen.queryByText('Confirm garment details')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Edited Dress')).toBeVisible();
    expect(await getCaptureDraft('draft-one')).toBeUndefined();
    expect(await listQueueItems()).toHaveLength(1);
  });

  it('warns before adding a likely duplicate and supports an intentional variant', async () => {
    const existing = await createQueueItem(
      queueInput({ duplicateKey: 'same-key', imageFingerprint: 'same-fingerprint' }),
    );
    await saveCaptureDraft(
      draft({ duplicateKey: existing.duplicateKey, imageFingerprint: existing.imageFingerprint }),
    );
    const user = userEvent.setup();
    render(<QueuePanel />);

    await user.selectOptions(await screen.findByLabelText('Garment category'), 'dress');
    await user.click(screen.getByRole('button', { name: 'Add to queue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This garment may already be in your queue.',
    );
    await user.click(screen.getByRole('button', { name: 'Add as a different variant' }));

    await waitFor(async () => expect(await listQueueItems()).toHaveLength(2));
    expect((await listQueueItems())[1]?.duplicateOverrideOf).toBe(existing.id);
  });

  it('filters, favorites, edits, reorders, selects, and removes queue items', async () => {
    const first = await createQueueItem(queueInput());
    const second = await createQueueItem(
      queueInput({
        productName: 'Second Top',
        category: 'top',
        imageFingerprint: 'second',
        duplicateKey: 'second',
        now: 200,
      }),
    );
    const user = userEvent.setup();
    render(<QueuePanel />);

    expect(await screen.findByText('Queue Dress')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Add to favorites' })[0]!);
    expect(await screen.findByRole('button', { name: 'Remove from favorites' })).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'Select Queue Dress for generation' }));
    expect(screen.getByText('1 selected')).toBeVisible();

    const secondCard = screen.getByText('Second Top').closest('article')!;
    await user.click(within(secondCard).getByRole('button', { name: 'Move up' }));
    await waitFor(async () => expect((await listQueueItems())[0]?.id).toBe(second.id));

    const firstCard = (await screen.findByText('Queue Dress')).closest('article')!;
    await user.click(within(firstCard).getByRole('button', { name: 'Edit' }));
    const nameInput = within(firstCard).getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Dress');
    await user.click(within(firstCard).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Updated Dress')).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Filter'), 'completed');
    expect(screen.getByText('No items match this filter')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show all items' }));
    const updatedCard = screen.getByText('Updated Dress').closest('article')!;
    await user.click(within(updatedCard).getByRole('button', { name: 'Remove' }));
    await waitFor(async () =>
      expect((await listQueueItems()).map((item) => item.id)).toEqual([second.id]),
    );
    expect(first.id).not.toBe(second.id);
  });

  it('shows the exact provider request count and requires confirmation before a batch', async () => {
    await saveImage({
      slot: 'person',
      blob: new Blob(['person'], { type: 'image/png' }),
      name: 'person.png',
      mime: 'image/png',
      width: 800,
      height: 1200,
      updatedAt: 99,
    });
    await createQueueItem(queueInput());
    await createQueueItem(
      queueInput({
        productName: 'Second Top',
        category: 'top',
        imageFingerprint: 'second',
        duplicateKey: 'second',
        now: 200,
      }),
    );
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, batchId: 'batch-1' });
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            apiUrl: 'https://api.example',
            accessCode: '',
            consent: true,
          }),
        },
      },
      permissions: { request: vi.fn().mockResolvedValue(true) },
      runtime: {
        sendMessage,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    const user = userEvent.setup();
    render(<QueuePanel />);

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Queue Dress for generation' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select Second Top for generation' }));
    await user.click(screen.getByRole('button', { name: 'Generate 2' }));

    const dialog = screen.getByRole('dialog', { name: 'Start 2 generations?' });
    expect(dialog).toHaveTextContent('request 2 provider credits');
    expect(sendMessage).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm 2' }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'START_BATCH',
        itemIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
      }),
    );
  });
});
