import { beforeEach, describe, expect, it } from 'vitest';
import { createCaptureDraft } from './capture';
import { getCaptureDraft } from './queue-storage';
import { clearAllLocalData } from './storage';

describe('garment capture drafts', () => {
  beforeEach(clearAllLocalData);

  it('persists sanitized metadata suggestions with a local image fingerprint', async () => {
    const draft = await createCaptureDraft({
      image: {
        blob: new Blob(['same pixels'], { type: 'image/png' }),
        name: 'selected.png',
        mime: 'image/png',
        width: 800,
        height: 1000,
        updatedAt: 1,
      },
      sourceImageUrl: 'https://cdn.example/dress.png',
      sourcePageUrl: 'https://ignored.example/product',
      metadata: {
        productName: { value: 'Linen Dress', source: 'json-ld', confidence: 'high' },
        displayedPrice: { value: 'USD 79', source: 'json-ld', confidence: 'high' },
        color: { value: 'Blue', source: 'json-ld', confidence: 'high' },
        store: { value: 'Example', source: 'open-graph', confidence: 'medium' },
        sourceUrl: 'https://user:pass@shop.example/dress#reviews',
        hostname: 'shop.example',
        warnings: [],
      },
      now: 100,
    });

    expect(draft).toMatchObject({
      productName: 'Linen Dress',
      displayedPrice: 'USD 79',
      color: 'Blue',
      store: 'Example',
      sourcePageUrl: 'https://shop.example/dress',
      createdAt: 100,
    });
    expect(draft.imageFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(draft.duplicateKey).not.toContain('pass');
    expect(await getCaptureDraft(draft.id)).toMatchObject({
      id: draft.id,
      productName: 'Linen Dress',
      imageFingerprint: draft.imageFingerprint,
      metadata: draft.metadata,
    });
  });

  it('uses honest defaults for a manual screenshot', async () => {
    const draft = await createCaptureDraft({
      image: {
        blob: new Blob(['manual'], { type: 'image/webp' }),
        name: 'green-skirt.webp',
        mime: 'image/webp',
        width: 500,
        height: 700,
        updatedAt: 1,
      },
      now: 200,
    });

    expect(draft).toMatchObject({
      productName: 'green skirt',
      store: 'Manual upload',
      sourcePageUrl: undefined,
      category: null,
    });
  });

  it('generates the same duplicate key for the same source, color, and pixels', async () => {
    const input = {
      image: {
        blob: new Blob(['duplicate'], { type: 'image/png' }),
        name: 'one.png',
        mime: 'image/png',
        width: 500,
        height: 700,
        updatedAt: 1,
      },
      sourcePageUrl: 'https://shop.example/product#one',
      now: 300,
    };
    const first = await createCaptureDraft(input);
    const second = await createCaptureDraft({
      ...input,
      sourcePageUrl: 'https://shop.example/product#two',
    });

    expect(second.duplicateKey).toBe(first.duplicateKey);
    expect(second.id).not.toBe(first.id);
  });
});
