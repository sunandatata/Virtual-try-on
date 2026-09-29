import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FashnTryOnProvider, fashnRequestShape } from './fashn';
import { getProvider } from './index';
import { MockTryOnProvider } from './mock';

const input = {
  modelImage: 'data:image/png;base64,model',
  garmentImage: 'data:image/png;base64,garment',
  category: 'one-pieces' as const,
  controlledFailure: false,
};

describe('providers', () => {
  beforeEach(() => {
    process.env.TRYON_PROVIDER = 'mock';
    process.env.FASHN_API_KEY = 'secret';
  });
  afterEach(() => vi.restoreAllMocks());

  it('defaults to mock and supports success/failure', async () => {
    expect(getProvider()).toBeInstanceOf(MockTryOnProvider);
    const provider = new MockTryOnProvider();
    const success = await provider.status('demo', { readyAt: 0, fail: false });
    const failure = await provider.status('demo', { readyAt: 0, fail: true });
    expect(success.status).toBe('succeeded');
    expect(failure.status).toBe('failed');
  });

  it('normalizes the stable v1.6 request', () => {
    expect(fashnRequestShape(input)).toEqual({
      model_name: 'tryon-v1.6',
      inputs: expect.objectContaining({
        model_image: input.modelImage,
        garment_image: input.garmentImage,
        category: 'one-pieces',
      }),
    });
  });

  it('submits and polls FASHN without leaking its key in the body', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'prediction-1' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'completed', output: ['https://cdn.fashn.ai/x.png'] }),
          {
            status: 200,
          },
        ),
      );
    const provider = new FashnTryOnProvider();
    expect(await provider.submit(input)).toEqual({ provider: 'fashn', jobId: 'prediction-1' });
    expect(await provider.status('prediction-1')).toEqual({
      status: 'succeeded',
      resultUrl: 'https://cdn.fashn.ai/x.png',
      isDemo: false,
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain('secret');
  });

  it('normalizes provider timeouts', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeout);
    await expect(new FashnTryOnProvider().submit(input)).rejects.toThrow('PROVIDER_TIMEOUT');
  });

  it('extracts detailed provider error messages from FASHN error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Face not detected in model image' } }), {
        status: 422,
      }),
    );
    await expect(new FashnTryOnProvider().submit(input)).rejects.toThrow(
      'Provider FASHN error: Face not detected in model image.',
    );
  });

  it('extracts string error messages from FASHN error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Insufficient credits' }), {
        status: 402,
      }),
    );
    await expect(new FashnTryOnProvider().submit(input)).rejects.toThrow(
      'Provider FASHN error: Insufficient credits.',
    );
  });
});
