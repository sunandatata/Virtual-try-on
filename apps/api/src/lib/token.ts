import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const tokenPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mock'), readyAt: z.number(), fail: z.boolean(), exp: z.number() }),
  z.object({ kind: z.literal('fashn'), providerJobId: z.string(), exp: z.number() }),
  z.object({ kind: z.literal('result'), url: z.string().url(), exp: z.number() }),
]);
export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

function secret(): string {
  const value = process.env.JOB_TOKEN_SECRET ?? 'development-only-secret-change-before-production';
  if (process.env.NODE_ENV === 'production' && value.length < 32) {
    throw new Error('JOB_TOKEN_SECRET must contain at least 32 characters in production.');
  }
  return value;
}

const base64url = (input: string) => Buffer.from(input).toString('base64url');

export function signToken(payload: TokenPayload): string {
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload {
  const [body, supplied] = token.split('.');
  if (!body || !supplied) throw new Error('Malformed token');
  const expected = createHmac('sha256', secret()).update(body).digest();
  const actual = Buffer.from(supplied, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid token signature');
  }
  const parsed = tokenPayloadSchema.parse(
    JSON.parse(Buffer.from(body, 'base64url').toString('utf8')),
  );
  if (parsed.exp < Date.now()) throw new Error('Expired token');
  return parsed;
}
