import { describe, expect, it } from 'vitest';
import {
  apparelToProviderCategory,
  extensionMessageSchema,
  productClassificationSchema,
  toProviderCategory,
} from './index.js';

describe('category mapping', () => {
  it.each([
    ['dress', 'one-pieces'],
    ['top', 'tops'],
    ['bottom', 'bottoms'],
  ] as const)('maps %s to %s', (input, expected) => {
    expect(toProviderCategory(input)).toBe(expected);
  });
});

describe('apparel category mapping', () => {
  it.each([
    ['outerwear', 'tops'],
    ['full-outfit', 'one-pieces'],
  ] as const)('maps extended apparel %s to provider category %s', (input, expected) => {
    expect(apparelToProviderCategory(input)).toBe(expected);
  });
});

describe('product classification schema', () => {
  it('accepts a high-confidence apparel classification', () => {
    expect(
      productClassificationSchema.safeParse({
        group: 'apparel',
        category: 'dress',
        confidence: 'high',
        evidence: ['title contains "dress"'],
      }).success,
    ).toBe(true);
  });

  it('accepts unsupported with null category', () => {
    expect(
      productClassificationSchema.safeParse({
        group: 'unsupported',
        category: null,
        confidence: 'high',
        evidence: ['product is a perfume'],
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown group', () => {
    expect(
      productClassificationSchema.safeParse({
        group: 'electronics',
        category: null,
        confidence: 'high',
        evidence: [],
      }).success,
    ).toBe(false);
  });
});

describe('extension messages', () => {
  it('accepts the page-context lookup used when Chrome omits tabs.Tab.url', () => {
    expect(extensionMessageSchema.safeParse({ type: 'GET_PAGE_CONTEXT' }).success).toBe(true);
  });

  it('requires a positive target tab ID when starting the picker', () => {
    expect(extensionMessageSchema.safeParse({ type: 'START_PAGE_PICKER', tabId: 7 }).success).toBe(
      true,
    );
    expect(extensionMessageSchema.safeParse({ type: 'START_PAGE_PICKER', tabId: 0 }).success).toBe(
      false,
    );
  });

  it('rejects unrecognized cross-context messages', () => {
    expect(extensionMessageSchema.safeParse({ type: 'EXECUTE_CODE', value: 'bad' }).success).toBe(
      false,
    );
  });

  it('requires a body profile for batch generation', () => {
    expect(
      extensionMessageSchema.safeParse({
        type: 'START_BATCH',
        itemIds: ['queue-1'],
        profileId: 'profile-1',
      }).success,
    ).toBe(true);
    expect(
      extensionMessageSchema.safeParse({ type: 'START_BATCH', itemIds: ['queue-1'] }).success,
    ).toBe(false);
  });
});
