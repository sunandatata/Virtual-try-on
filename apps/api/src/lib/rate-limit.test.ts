import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryRateLimiter,
  rateLimiter,
  resetRateLimiterMemory,
  UpstashRateLimiter,
} from './rate-limit';

describe('MemoryRateLimiter', () => {
  beforeEach(() => {
    resetRateLimiterMemory();
  });

  it('permits up to 10 requests within a 60-second window', async () => {
    const limiter = new MemoryRateLimiter();
    const key = 'test-client-1';

    for (let i = 0; i < 10; i++) {
      const result = await limiter.check(key);
      expect(result.allowed).toBe(true);
      if (i === 0) {
        expect(result.retryAfter).toBe(0);
      }
    }

    const blocked = await limiter.check(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it('isolates rate limits per client key', async () => {
    const limiter = new MemoryRateLimiter();

    for (let i = 0; i < 10; i++) {
      await limiter.check('client-a');
    }

    const blockedA = await limiter.check('client-a');
    expect(blockedA.allowed).toBe(false);

    const allowedB = await limiter.check('client-b');
    expect(allowedB.allowed).toBe(true);
  });

  it('resets after the bucket window expires', async () => {
    const limiter = new MemoryRateLimiter();
    const key = 'expiring-client';

    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    for (let i = 0; i < 10; i++) {
      await limiter.check(key);
    }
    expect((await limiter.check(key)).allowed).toBe(false);

    // Fast-forward past the 60-second window
    dateSpy.mockReturnValue(now + 60_001);

    const resultAfterReset = await limiter.check(key);
    expect(resultAfterReset.allowed).toBe(true);
    expect(resultAfterReset.retryAfter).toBe(0);

    dateSpy.mockRestore();
  });
});

describe('UpstashRateLimiter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct pipeline commands and allows when count <= 10', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([{ result: 5 }, { result: 1 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const limiter = new UpstashRateLimiter('https://example.upstash.io', 'test-token');
    const result = await limiter.check('client-redis');

    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(60);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.upstash.io/pipeline');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });

    const parsedBody = JSON.parse(String(options.body));
    expect(parsedBody).toHaveLength(2);
    expect(parsedBody[0][0]).toBe('INCR');
    expect(parsedBody[0][1]).toContain('tryon:');
    expect(parsedBody[0][1]).toContain(':client-redis');
    expect(parsedBody[1]).toEqual(['EXPIRE', parsedBody[0][1], 70, 'NX']);
  });

  it('rejects when the incremented count exceeds 10', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([{ result: 11 }, { result: 1 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const limiter = new UpstashRateLimiter('https://example.upstash.io', 'test-token');
    const result = await limiter.check('busy-client');

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(60);
  });

  it('throws an error if Upstash responds with an HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const limiter = new UpstashRateLimiter('https://example.upstash.io', 'test-token');
    await expect(limiter.check('err-client')).rejects.toThrow('Rate limiter unavailable');
  });
});

describe('rateLimiter factory', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns MemoryRateLimiter by default', () => {
    delete process.env.RATE_LIMIT_PROVIDER;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const instance = rateLimiter();
    expect(instance).toBeInstanceOf(MemoryRateLimiter);
  });

  it('returns UpstashRateLimiter when upstash is configured with url and token', () => {
    process.env.RATE_LIMIT_PROVIDER = 'upstash';
    process.env.UPSTASH_REDIS_REST_URL = 'https://custom.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-token';

    const instance = rateLimiter();
    expect(instance).toBeInstanceOf(UpstashRateLimiter);
  });

  it('falls back to MemoryRateLimiter when upstash is specified but credentials are missing', () => {
    process.env.RATE_LIMIT_PROVIDER = 'upstash';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const instance = rateLimiter();
    expect(instance).toBeInstanceOf(MemoryRateLimiter);
  });
});
