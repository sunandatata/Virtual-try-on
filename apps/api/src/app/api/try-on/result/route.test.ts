import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '@/lib/token';
import { GET } from './route';

function resultRequest(token?: string) {
  const url = new URL('http://localhost/api/try-on/result');
  if (token) url.searchParams.set('token', token);
  return new Request(url, { headers: { Origin: 'chrome-extension://abc' } });
}

describe('GET /api/try-on/result proxy boundary', () => {
  beforeEach(() => {
    process.env.ALLOWED_EXTENSION_ORIGINS = 'chrome-extension://abc';
    process.env.APP_ACCESS_CODE = '';
    process.env.JOB_TOKEN_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['missing token', () => undefined],
    [
      'job token',
      () =>
        signToken({
          kind: 'mock',
          readyAt: Date.now(),
          fail: false,
          exp: Date.now() + 60_000,
        }),
    ],
    [
      'untrusted result host',
      () =>
        signToken({
          kind: 'result',
          url: 'https://attacker.example/result.png',
          exp: Date.now() + 60_000,
        }),
    ],
  ])('rejects a %s', async (_case, token) => {
    const response = await GET(resultRequest(token()));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TOKEN', retryable: false },
    });
  });

  it('proxies a signed FASHN CDN image with defensive response headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const token = signToken({
      kind: 'result',
      url: 'https://cdn.fashn.ai/result.png',
      exp: Date.now() + 60_000,
    });

    const response = await GET(resultRequest(token));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://cdn.fashn.ai/result.png'),
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
