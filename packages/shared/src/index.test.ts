import { describe, expect, it } from 'vitest';
import { extensionMessageSchema, toProviderCategory } from './index.js';

describe('category mapping', () => {
  it.each([
    ['dress', 'one-pieces'],
    ['top', 'tops'],
    ['bottom', 'bottoms'],
  ] as const)('maps %s to %s', (input, expected) => {
    expect(toProviderCategory(input)).toBe(expected);
  });
});

describe('extension messages', () => {
  it('rejects unrecognized cross-context messages', () => {
    expect(extensionMessageSchema.safeParse({ type: 'EXECUTE_CODE', value: 'bad' }).success).toBe(
      false,
    );
  });
});
