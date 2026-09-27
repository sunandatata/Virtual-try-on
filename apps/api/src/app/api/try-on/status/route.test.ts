import { beforeEach, describe, expect, it } from 'vitest';
import { signToken } from '@/lib/token';
import { GET } from './route';

function statusRequest(token?: string) {
  const url = new URL('http://localhost/api/try-on/status');
  if (token) url.searchParams.set('token', token);
  return new Request(url, { headers: { Origin: 'chrome-extension://abc' } });
}

describe('GET /api/try-on/status token boundary', () => {
  beforeEach(() => {
    process.env.ALLOWED_EXTENSION_ORIGINS = 'chrome-extension://abc';
    process.env.APP_ACCESS_CODE = '';
    process.env.JOB_TOKEN_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  });

  it.each([
    ['missing token', () => undefined],
    ['malformed token', () => 'not-a-signed-token'],
    [
      'wrong token type',
      () =>
        signToken({
          kind: 'result',
          url: 'https://cdn.fashn.ai/result.png',
          exp: Date.now() + 60_000,
        }),
    ],
  ])('rejects a %s', async (_case, token) => {
    const response = await GET(statusRequest(token()));

    expect(response.status).toBe(400);
    expect(response.headers.get('access-control-allow-origin')).toBe('chrome-extension://abc');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TOKEN', retryable: false },
    });
  });

  it('returns only the state encoded by a valid mock job token', async () => {
    const processing = signToken({
      kind: 'mock',
      readyAt: Date.now() + 60_000,
      fail: false,
      exp: Date.now() + 60_000,
    });
    const completed = signToken({
      kind: 'mock',
      readyAt: Date.now() - 1,
      fail: false,
      exp: Date.now() + 60_000,
    });

    await expect((await GET(statusRequest(processing))).json()).resolves.toMatchObject({
      ok: true,
      status: 'processing',
    });
    await expect((await GET(statusRequest(completed))).json()).resolves.toMatchObject({
      ok: true,
      status: 'succeeded',
      isDemo: true,
      resultUrl: expect.stringMatching(/^data:image\/svg\+xml;base64,/),
    });
  });
});
