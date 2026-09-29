import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processActiveBatchStep } from './batch-engine';
import type { BatchEngineDependencies } from './batch-engine';
import { createGenerationBatch, getGenerationBatch, updateGenerationBatch } from './batch-storage';
import { createQueueItem, getQueueItem, updateQueueItem } from './queue-storage';
import type { CreateQueueItemInput } from './queue-storage';
import { clearAllLocalData, saveImage } from './storage';
import { createBodyProfile, setBodyProfileConsent } from './body-profile-storage';
import type { BodyProfile } from './body-profile-storage';

function queueInput(index: number): CreateQueueItemInput {
  return {
    productName: `Garment ${index}`,
    store: 'Example',
    category: 'dress',
    imageFingerprint: `fingerprint-${index}`,
    duplicateKey: `duplicate-${index}`,
    garment: {
      blob: new Blob([`garment-${index}`], { type: 'image/png' }),
      name: `${index}.png`,
      mime: 'image/png',
      width: 600,
      height: 900,
    },
    now: index,
  };
}

async function savePerson(): Promise<BodyProfile> {
  await saveImage({
    slot: 'person',
    blob: new Blob(['person'], { type: 'image/png' }),
    name: 'person.png',
    mime: 'image/png',
    width: 800,
    height: 1200,
    updatedAt: 99,
  });
  const profile = await createBodyProfile({
    profileName: 'Front',
    image: {
      blob: new Blob(['person'], { type: 'image/png' }),
      imageName: 'person.png',
      mime: 'image/png',
      width: 800,
      height: 1200,
    },
    now: 99,
  });
  return setBodyProfileConsent(profile.id, true);
}

function dependencies(fetcher: typeof fetch): BatchEngineDependencies {
  return {
    fetcher,
    getSettings: async () => ({
      apiUrl: 'https://api.example',
      accessCode: 'test-access',
      consent: true,
    }),
    scheduleWake: vi.fn(),
    notify: vi.fn(),
    now: () => 500,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sequential batch engine', () => {
  let profile: BodyProfile;
  beforeEach(async () => {
    await clearAllLocalData();
    profile = await savePerson();
    // fake-indexeddb does not preserve jsdom Blob prototypes after structured cloning.
    vi.spyOn(FormData.prototype, 'set').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('submits and completes queue items one at a time in batch order', async () => {
    const first = await createQueueItem(queueInput(1));
    const second = await createQueueItem(queueInput(2));
    const batch = await createGenerationBatch([first.id, second.id], profile, 100);
    let token = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        token += 1;
        return jsonResponse(
          {
            ok: true,
            jobToken: `token-${token}`,
            status: 'processing',
            provider: 'mock',
          },
          202,
        );
      }
      if (url.includes('/status')) {
        return jsonResponse({
          ok: true,
          status: 'succeeded',
          resultUrl: `https://api.example/result-${token}`,
          isDemo: true,
        });
      }
      return new Response(new Blob([`result-${token}`], { type: 'image/svg+xml' }));
    });
    const fetcher = fetchMock as unknown as typeof fetch;
    const deps = dependencies(fetcher);

    await processActiveBatchStep(deps);
    expect(await getQueueItem(first.id)).toMatchObject({
      status: 'generating',
      job: { status: 'processing', jobToken: 'token-1', attemptCount: 1 },
    });
    expect(await getQueueItem(second.id)).toMatchObject({ job: { status: 'queued' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await processActiveBatchStep(deps);
    expect(await getQueueItem(first.id)).toMatchObject({
      status: 'completed',
      job: { status: 'succeeded', isDemo: true, provider: 'mock' },
    });
    expect(await getQueueItem(second.id)).toMatchObject({ job: { status: 'queued' } });

    await processActiveBatchStep(deps);
    expect(await getQueueItem(second.id)).toMatchObject({
      status: 'generating',
      job: { status: 'processing', jobToken: 'token-2' },
    });
    await processActiveBatchStep(deps);

    expect(await getGenerationBatch(batch.id)).toMatchObject({
      status: 'completed',
      completedItemIds: [first.id, second.id],
      failedItemIds: [],
      currentItemId: undefined,
    });
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(2);
  });

  it('polls an existing provider token without submitting again', async () => {
    const item = await createQueueItem(queueInput(1));
    const batch = await createGenerationBatch([item.id], profile, 100);
    await updateQueueItem(item.id, (current) => ({
      ...current,
      job: {
        status: 'processing',
        attemptCount: 1,
        jobToken: 'existing-token',
        provider: 'fashn',
        updatedAt: 100,
      },
    }));
    await updateGenerationBatch(batch.id, (current) => ({
      ...current,
      status: 'running',
      currentItemId: item.id,
    }));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ ok: true, status: 'processing' }),
    );
    const fetcher = fetchMock as unknown as typeof fetch;
    const deps = dependencies(fetcher);

    await processActiveBatchStep(deps);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('existing-token');
    expect(deps.scheduleWake).toHaveBeenCalledWith(30_000);
  });

  it('does not resubmit an interrupted submission with an ambiguous provider outcome', async () => {
    const item = await createQueueItem(queueInput(1));
    const batch = await createGenerationBatch([item.id], profile, 100);
    await updateQueueItem(item.id, (current) => ({
      ...current,
      job: {
        status: 'submitting',
        attemptCount: 1,
        submissionId: 'batch:item:1',
        updatedAt: 100,
      },
    }));
    const fetcher = vi.fn() as unknown as typeof fetch;

    await processActiveBatchStep(dependencies(fetcher));

    expect(fetcher).not.toHaveBeenCalled();
    expect(await getQueueItem(item.id)).toMatchObject({
      status: 'failed',
      job: { status: 'failed', lastError: { code: 'AMBIGUOUS_SUBMISSION', retryable: true } },
    });
    expect(await getGenerationBatch(batch.id)).toMatchObject({
      status: 'completed-with-errors',
      failedItemIds: [item.id],
    });
  });

  it('isolates a provider failure and schedules the next item', async () => {
    const first = await createQueueItem(queueInput(1));
    const second = await createQueueItem(queueInput(2));
    const batch = await createGenerationBatch([first.id, second.id], profile, 100);
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          ok: false,
          error: { code: 'RATE_LIMITED', message: 'Wait before retrying.', retryable: true },
        },
        429,
      ),
    );
    const fetcher = fetchMock as unknown as typeof fetch;
    const deps = dependencies(fetcher);

    await processActiveBatchStep(deps);

    expect(await getQueueItem(first.id)).toMatchObject({
      status: 'failed',
      job: { lastError: { code: 'RATE_LIMITED', retryable: true } },
    });
    expect(await getQueueItem(second.id)).toMatchObject({ job: { status: 'queued' } });
    expect(await getGenerationBatch(batch.id)).toMatchObject({
      status: 'running',
      failedItemIds: [first.id],
    });
    expect(deps.scheduleWake).toHaveBeenCalledWith(500);
  });
});
