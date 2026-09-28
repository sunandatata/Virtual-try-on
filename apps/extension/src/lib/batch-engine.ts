import { apiErrorSchema, statusResponseSchema, submitResponseSchema } from '@virtual-try-on/shared';
import { getActiveGenerationBatch, updateGenerationBatch } from './batch-storage';
import type { GenerationBatch } from './batch-storage';
import {
  getQueueAssetByKind,
  getQueueItem,
  saveQueueResult,
  updateQueueItem,
} from './queue-storage';
import { getImage } from './storage';
import type { ExtensionSettings } from './settings';

export type BatchEngineDependencies = {
  fetcher: typeof fetch;
  getSettings: () => Promise<ExtensionSettings>;
  scheduleWake: (delayMs: number) => Promise<void> | void;
  notify: () => Promise<void> | void;
  now?: () => number;
};

const POLL_DELAY_MS = 30_000;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function notify(dependencies: BatchEngineDependencies) {
  await dependencies.notify();
}

async function finishBatchItem(
  batch: GenerationBatch,
  itemId: string,
  outcome: 'completed' | 'failed',
  dependencies: BatchEngineDependencies,
): Promise<void> {
  const next = await updateGenerationBatch(batch.id, (current) => {
    const completedItemIds =
      outcome === 'completed'
        ? unique([...current.completedItemIds, itemId])
        : current.completedItemIds;
    const failedItemIds =
      outcome === 'failed' ? unique([...current.failedItemIds, itemId]) : current.failedItemIds;
    const finished = completedItemIds.length + failedItemIds.length >= current.itemIds.length;
    return {
      ...current,
      currentItemId: undefined,
      completedItemIds,
      failedItemIds,
      status: finished
        ? failedItemIds.length > 0
          ? 'completed-with-errors'
          : 'completed'
        : 'running',
    };
  });
  await notify(dependencies);
  if (next.status === 'running') await dependencies.scheduleWake(500);
}

async function failItem(
  batch: GenerationBatch,
  itemId: string,
  error: { message: string; retryable: boolean; code?: string },
  dependencies: BatchEngineDependencies,
): Promise<void> {
  const now = dependencies.now?.() ?? Date.now();
  await updateQueueItem(itemId, (item) => ({
    ...item,
    status: 'failed',
    job: {
      ...item.job,
      status: 'failed',
      lastError: { ...error, at: now },
      updatedAt: now,
    },
  }));
  await finishBatchItem(batch, itemId, 'failed', dependencies);
}

async function parseError(response: Response): Promise<{
  message: string;
  retryable: boolean;
  code?: string;
}> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { message: `Try-on service returned HTTP ${response.status}.`, retryable: true };
  }
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success
    ? parsed.data.error
    : { message: 'The try-on service returned an unexpected response.', retryable: true };
}

export async function processActiveBatchStep(dependencies: BatchEngineDependencies): Promise<void> {
  const batch = await getActiveGenerationBatch();
  if (!batch) return;
  const person = await getImage('person');
  if (!person || person.updatedAt !== batch.personImageUpdatedAt) {
    const unfinished = batch.itemIds.filter(
      (id) => !batch.completedItemIds.includes(id) && !batch.failedItemIds.includes(id),
    );
    for (const itemId of unfinished) {
      await failItem(
        batch,
        itemId,
        {
          message: 'The body photo changed or was removed before this job could run.',
          retryable: true,
          code: 'BODY_PROFILE_CHANGED',
        },
        dependencies,
      );
    }
    return;
  }

  const unfinished = batch.itemIds.filter(
    (id) => !batch.completedItemIds.includes(id) && !batch.failedItemIds.includes(id),
  );
  if (unfinished.length === 0) {
    await updateGenerationBatch(batch.id, (current) => ({
      ...current,
      currentItemId: undefined,
      status: current.failedItemIds.length > 0 ? 'completed-with-errors' : 'completed',
    }));
    await notify(dependencies);
    return;
  }

  const itemId =
    batch.currentItemId && unfinished.includes(batch.currentItemId)
      ? batch.currentItemId
      : unfinished[0]!;
  const currentBatch =
    batch.currentItemId === itemId
      ? batch
      : await updateGenerationBatch(batch.id, (current) => ({
          ...current,
          status: 'running',
          currentItemId: itemId,
        }));
  const item = await getQueueItem(itemId);
  if (!item) {
    await finishBatchItem(currentBatch, itemId, 'failed', dependencies);
    return;
  }
  if (item.status === 'completed') {
    await finishBatchItem(currentBatch, itemId, 'completed', dependencies);
    return;
  }
  if (item.status === 'failed' || item.job.status === 'failed') {
    await finishBatchItem(currentBatch, itemId, 'failed', dependencies);
    return;
  }
  if (item.job.status === 'submitting') {
    await failItem(
      currentBatch,
      itemId,
      {
        message:
          'Submission was interrupted before a provider token was saved. It was not resubmitted automatically to avoid duplicate charges.',
        retryable: true,
        code: 'AMBIGUOUS_SUBMISSION',
      },
      dependencies,
    );
    return;
  }

  const settings = await dependencies.getSettings();
  if (!settings.consent) {
    await failItem(
      currentBatch,
      itemId,
      { message: 'Body-photo processing consent is required.', retryable: true },
      dependencies,
    );
    return;
  }
  const origin = new URL(settings.apiUrl).origin;
  const headers: Record<string, string> = settings.accessCode
    ? { 'X-Access-Code': settings.accessCode }
    : {};

  if (item.job.status === 'queued' || item.job.status === 'idle') {
    const garment = await getQueueAssetByKind(item.id, 'garment');
    if (!garment || !item.category) {
      await failItem(
        currentBatch,
        itemId,
        { message: 'The garment image or category is missing.', retryable: false },
        dependencies,
      );
      return;
    }
    const now = dependencies.now?.() ?? Date.now();
    const submissionId = `${currentBatch.id}:${item.id}:${item.job.attemptCount + 1}`;
    await updateQueueItem(item.id, (current) => ({
      ...current,
      status: 'generating',
      job: {
        status: 'submitting',
        attemptCount: current.job.attemptCount + 1,
        submissionId,
        updatedAt: now,
      },
    }));
    await notify(dependencies);
    try {
      const form = new FormData();
      form.set('person', person.blob, person.name);
      form.set('garment', garment.blob, garment.name);
      form.set('category', item.category);
      form.set('submissionId', submissionId);
      const response = await dependencies.fetcher(`${origin}/api/try-on`, {
        method: 'POST',
        headers,
        body: form,
      });
      if (!response.ok) throw await parseError(response);
      const body: unknown = await response.json();
      const parsed = submitResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw { message: 'Unexpected try-on submission response.', retryable: true };
      }
      await updateQueueItem(item.id, (current) => ({
        ...current,
        status: 'generating',
        job: {
          ...current.job,
          status: 'processing',
          provider: parsed.data.provider,
          jobToken: parsed.data.jobToken,
          updatedAt: dependencies.now?.() ?? Date.now(),
        },
      }));
      await notify(dependencies);
      await dependencies.scheduleWake(POLL_DELAY_MS);
    } catch (reason) {
      const error = reason as { message?: string; retryable?: boolean; code?: string };
      await failItem(
        currentBatch,
        itemId,
        {
          message: error.message ?? 'Could not submit this garment.',
          retryable: error.retryable ?? true,
          code: error.code,
        },
        dependencies,
      );
    }
    return;
  }

  if (item.job.status === 'processing' && item.job.jobToken) {
    try {
      const response = await dependencies.fetcher(
        `${origin}/api/try-on/status?token=${encodeURIComponent(item.job.jobToken)}`,
        { headers },
      );
      if (!response.ok) throw await parseError(response);
      const body: unknown = await response.json();
      const parsed = statusResponseSchema.safeParse(body);
      if (!parsed.success) throw { message: 'Unexpected try-on status response.', retryable: true };
      if (parsed.data.status === 'processing') {
        await dependencies.scheduleWake(POLL_DELAY_MS);
        return;
      }
      if (parsed.data.status === 'failed' || !parsed.data.resultUrl) {
        await failItem(
          currentBatch,
          itemId,
          { message: parsed.data.error ?? 'Generation failed.', retryable: true },
          dependencies,
        );
        return;
      }
      const resultResponse = await dependencies.fetcher(
        parsed.data.resultUrl.startsWith('/')
          ? `${origin}${parsed.data.resultUrl}`
          : parsed.data.resultUrl,
        { headers },
      );
      if (!resultResponse.ok) {
        throw { message: 'The generated result could not be downloaded.', retryable: true };
      }
      const blob = await resultResponse.blob();
      await saveQueueResult(item.id, {
        blob,
        name: parsed.data.isDemo ? 'virtual-try-on-demo.svg' : 'virtual-try-on-result.png',
        mime: blob.type,
        width: 0,
        height: 0,
      });
      await finishBatchItem(currentBatch, itemId, 'completed', dependencies);
    } catch (reason) {
      const error = reason as { message?: string; retryable?: boolean; code?: string };
      await failItem(
        currentBatch,
        itemId,
        {
          message: error.message ?? 'Could not check this generation.',
          retryable: error.retryable ?? true,
          code: error.code,
        },
        dependencies,
      );
    }
  }
}
