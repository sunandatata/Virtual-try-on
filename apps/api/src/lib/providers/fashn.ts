import type { ProviderJob, ProviderStatus, ProviderSubmission, TryOnProvider } from './types';

const BASE_URL = 'https://api.fashn.ai/v1';

async function fashnFetch(path: string, init: RequestInit): Promise<Response> {
  const key = process.env.FASHN_API_KEY;
  if (!key) throw new Error('FASHN_API_KEY is not configured.');
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      throw new Error('PROVIDER_TIMEOUT');
    }
    throw error;
  }
  if (!response.ok) {
    let detail = '';
    try {
      const errBody = (await response.json()) as {
        error?: { message?: string } | string | null;
        message?: string;
      };
      if (typeof errBody.error === 'string') {
        detail = errBody.error;
      } else if (errBody.error?.message) {
        detail = errBody.error.message;
      } else if (errBody.message) {
        detail = errBody.message;
      }
    } catch {
      // non-JSON response body
    }
    const retryable = response.status === 429 || response.status >= 500;
    const prefix = retryable ? 'Temporary' : 'Provider';
    const message = detail
      ? `${prefix} FASHN error: ${detail}.`
      : `${prefix} FASHN error (${response.status}).`;
    throw new Error(message);
  }
  return response;
}

export class FashnTryOnProvider implements TryOnProvider {
  async submit(input: ProviderSubmission): Promise<ProviderJob> {
    const response = await fashnFetch('/run', {
      method: 'POST',
      body: JSON.stringify(fashnRequestShape(input)),
    });
    const body = (await response.json()) as { id?: string; error?: unknown };
    if (!body.id) throw new Error('FASHN did not return a prediction ID.');
    return { provider: 'fashn', jobId: body.id };
  }

  async status(jobId: string): Promise<ProviderStatus> {
    const response = await fashnFetch(`/status/${encodeURIComponent(jobId)}`, { method: 'GET' });
    const body = (await response.json()) as {
      status?: string;
      output?: string[];
      error?: { message?: string } | string | null;
    };
    if (['starting', 'in_queue', 'processing'].includes(body.status ?? '')) {
      return { status: 'processing' };
    }
    if (body.status === 'completed' && body.output?.[0]) {
      return { status: 'succeeded', resultUrl: body.output[0], isDemo: false };
    }
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    return { status: 'failed', error: message ?? 'The try-on provider could not create a result.' };
  }
}

export const fashnRequestShape = (input: ProviderSubmission) => ({
  model_name: 'tryon-v1.6',
  inputs: {
    model_image: input.modelImage,
    garment_image: input.garmentImage,
    category: input.category,
    mode: 'balanced',
    num_samples: 1,
    output_format: 'png',
  },
});
