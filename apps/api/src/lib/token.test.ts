import { beforeEach, describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './token';

describe('signed job tokens', () => {
  beforeEach(() => {
    process.env.JOB_TOKEN_SECRET = 'test-secret-that-is-long-enough-for-hmac';
  });

  it('round-trips the minimum provider reference', () => {
    const value = { kind: 'fashn' as const, providerJobId: 'pred_123', exp: Date.now() + 1000 };
    expect(verifyToken(signToken(value))).toEqual(value);
  });

  it('rejects tampering and expiry', () => {
    const signed = signToken({ kind: 'mock', readyAt: 1, fail: false, exp: Date.now() - 1 });
    expect(() => verifyToken(signed)).toThrow(/Expired/);
    expect(() => verifyToken(`${signed}x`)).toThrow();
  });
});
