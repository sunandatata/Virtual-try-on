type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimiter {
  check(key: string): Promise<{ allowed: boolean; retryAfter: number }>;
}

class MemoryRateLimiter implements RateLimiter {
  async check(key: string) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return { allowed: true, retryAfter: 0 };
    }
    bucket.count += 1;
    return { allowed: bucket.count <= 10, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
}

class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async check(key: string) {
    const minute = Math.floor(Date.now() / 60_000);
    const redisKey = `tryon:${minute}:${key}`;
    const response = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['EXPIRE', redisKey, 70, 'NX'],
      ]),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Rate limiter unavailable');
    const results = (await response.json()) as Array<{ result: number }>;
    return { allowed: (results[0]?.result ?? 99) <= 10, retryAfter: 60 };
  }
}

export function rateLimiter(): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return process.env.RATE_LIMIT_PROVIDER === 'upstash' && url && token
    ? new UpstashRateLimiter(url, token)
    : new MemoryRateLimiter();
}
