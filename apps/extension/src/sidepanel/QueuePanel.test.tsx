import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQueueItem,
  getCaptureDraft,
  listQueueItems,
  saveCaptureDraft,
  saveQueueResult,
} from '../lib/queue-storage';
import type { CaptureDraft, CreateQueueItemInput } from '../lib/queue-storage';
import { clearAllLocalData, saveImage } from '../lib/storage';
import { listCollections } from '../lib/collection-storage';
import { createBodyProfile, setBodyProfileConsent } from '../lib/body-profile-storage';
import { QueuePanel } from './QueuePanel';

const inspectReadiness = vi.hoisted(() => vi.fn());
vi.mock('../lib/readiness', () => ({ inspectImageReadiness: inspectReadiness }));

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
    inspectReadiness.mockReset();
    inspectReadiness.mockResolvedValue({
      level: 'ready',
      canContinue: true,
      checks: [
        { code: 'ready', severity: 'info', message: 'Images look usable.', blocking: false },
      ],
    });
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

    expect(
      await screen.findByRole('heading', { name: 'Confirm garment details' }, { timeout: 3_000 }),
    ).toBeVisible();
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

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'completed');
    expect(screen.getByText('No items match this filter')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show all items' }));
    const updatedCard = screen.getByText('Updated Dress').closest('article')!;
    await user.click(within(updatedCard).getByRole('button', { name: 'Remove' }));
    await waitFor(async () =>
      expect((await listQueueItems()).map((item) => item.id)).toEqual([second.id]),
    );
    expect(first.id).not.toBe(second.id);
  });

  it('creates, assigns, filters, renames, and deletes collections without deleting garments', async () => {
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
    const user = userEvent.setup();
    render(<QueuePanel />);

    await user.click(await screen.findByText('Manage collections'));
    await user.type(screen.getByLabelText('New collection'), 'Vacation');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect((await screen.findAllByText('Vacation'))[0]).toBeVisible();

    const dressCard = screen.getByText('Queue Dress').closest('article')!;
    await user.click(within(dressCard).getByRole('button', { name: 'Collections' }));
    await user.click(within(dressCard).getByRole('checkbox', { name: 'Vacation' }));
    const vacationOption = screen.getByRole('option', { name: 'Vacation' });
    await user.selectOptions(screen.getByLabelText('Filter by collection'), vacationOption);
    expect(screen.getByText('Queue Dress')).toBeVisible();
    expect(screen.queryByText('Second Top')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter by collection'), 'all');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const rename = screen.getByLabelText('Rename Vacation');
    await user.clear(rename);
    await user.type(rename, 'Summer');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect((await screen.findAllByText('Summer'))[0]).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect(await listCollections()).toEqual([]));
    expect(await listQueueItems()).toHaveLength(2);
  });

  it('shows the exact provider request count and requires confirmation before a batch', async () => {
    const profile = await createBodyProfile({
      profileName: 'Front',
      image: {
        blob: new Blob(['person'], { type: 'image/png' }),
        imageName: 'person.png',
        mime: 'image/png',
        width: 800,
        height: 1200,
      },
    });
    await setBodyProfileConsent(profile.id, true);
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

    const dialog = await screen.findByRole('dialog', { name: 'Start 2 generations?' });
    expect(dialog).toHaveTextContent('request 2 provider credits');
    expect(within(dialog).getAllByText('Ready')).toHaveLength(3);
    expect(sendMessage).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm 2' }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'START_BATCH',
        itemIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
        profileId: profile.id,
      }),
    );
  });

  it('explains replacement guidance and requires an explicit safe override', async () => {
    const profile = await createBodyProfile({
      profileName: 'Front',
      image: {
        blob: new Blob(['person'], { type: 'image/png' }),
        imageName: 'person.png',
        mime: 'image/png',
        width: 800,
        height: 1200,
      },
    });
    await setBodyProfileConsent(profile.id, true);
    await createQueueItem(queueInput());
    inspectReadiness
      .mockResolvedValueOnce({
        level: 'ready',
        canContinue: true,
        checks: [
          { code: 'ready', severity: 'info', message: 'Profile is usable.', blocking: false },
        ],
      })
      .mockResolvedValueOnce({
        level: 'replace-recommended',
        canContinue: true,
        checks: [
          {
            code: 'too-small',
            severity: 'error',
            message: 'This garment image is extremely small and should be replaced.',
            blocking: false,
          },
        ],
      });
    const user = userEvent.setup();
    render(<QueuePanel />);

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Queue Dress for generation' }),
    );
    await user.click(screen.getByRole('button', { name: 'Generate 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start 1 generation?' });
    expect(dialog).toHaveTextContent('Replace recommended');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm 1' });
    expect(confirm).toBeDisabled();
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Continue despite the replacement recommendations',
      }),
    );
    expect(confirm).toBeEnabled();
  });

  it('displays try-on results on completed queue items, distinguishes simulation, and opens drawer', async () => {
    const item = await createQueueItem(queueInput());
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

    const user = userEvent.setup();
    render(<QueuePanel />);

    expect(await screen.findByText('Simulated · Demo (not AI)')).toBeVisible();
    expect(await screen.findByAltText('Queue Dress try-on result')).toBeVisible();

    const downloadLink = screen.getByRole('link', { name: 'Download' });
    expect(downloadLink).toHaveAttribute('download', 'queue-dress-tryon.svg');

    const viewButton = screen.getByRole('button', { name: 'View result' });
    await user.click(viewButton);

    const drawer = await screen.findByLabelText('Queue Dress try-on preview');
    expect(within(drawer).getByText('Simulated result (Demo)')).toBeVisible();
    expect(within(drawer).getByText('Original garment')).toBeVisible();
    expect(within(drawer).getByRole('link', { name: 'Download try-on' })).toHaveAttribute(
      'download',
      'queue-dress-tryon.svg',
    );

    await user.click(within(drawer).getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByLabelText('Queue Dress try-on preview')).not.toBeInTheDocument();
  });
});
