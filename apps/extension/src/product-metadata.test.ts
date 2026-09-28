import { describe, expect, it } from 'vitest';
import { extractProductMetadata } from './product-metadata';
import {
  completeProductPage,
  multiplePriceProductPage,
  noMetadataProductPage,
  partialProductPage,
} from './test/fixtures/product-pages';

function fixture(html: string): { document: Document; image: HTMLImageElement } {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return { document, image: document.querySelector<HTMLImageElement>('#garment')! };
}

describe('product metadata extraction', () => {
  it('prefers matching JSON-LD product data and records its provenance', () => {
    const { document, image } = fixture(completeProductPage);
    const result = extractProductMetadata(
      document,
      image,
      'https://shop.example/products/dress#details',
    );

    expect(result).toMatchObject({
      productName: { value: 'Structured Linen Dress', source: 'json-ld', confidence: 'high' },
      displayedPrice: { value: 'USD 79.00', source: 'json-ld', confidence: 'high' },
      color: { value: 'Ocean Blue', source: 'json-ld', confidence: 'high' },
      store: { value: 'Example Boutique', source: 'open-graph', confidence: 'medium' },
      sourceUrl: 'https://shop.example/products/dress',
      hostname: 'shop.example',
      warnings: [],
    });
  });

  it('falls back through Open Graph and nearby product content', () => {
    const { document, image } = fixture(partialProductPage);
    const result = extractProductMetadata(document, image, 'https://shop.example/blouse');

    expect(result.productName).toEqual({
      value: 'Summer Blouse',
      source: 'open-graph',
      confidence: 'medium',
    });
    expect(result.displayedPrice).toEqual({
      value: '$42.00',
      source: 'nearby-content',
      confidence: 'low',
    });
    expect(result.store).toEqual({
      value: 'shop.example',
      source: 'hostname',
      confidence: 'high',
    });
  });

  it('does not guess when multiple nearby prices are plausible', () => {
    const { document, image } = fixture(multiplePriceProductPage);
    const result = extractProductMetadata(document, image, 'https://shop.example/evening');

    expect(result.displayedPrice).toBeUndefined();
    expect(result.warnings).toContain(
      'Multiple nearby prices were found; review the price before saving.',
    );
  });

  it('returns only trustworthy URL and hostname context when metadata is absent', () => {
    const { document, image } = fixture(noMetadataProductPage);
    const result = extractProductMetadata(document, image, 'https://www.shop.example/plain#photo');

    expect(result.productName).toBeUndefined();
    expect(result.displayedPrice).toBeUndefined();
    expect(result.color).toBeUndefined();
    expect(result.store).toEqual({
      value: 'shop.example',
      source: 'hostname',
      confidence: 'high',
    });
    expect(result.sourceUrl).toBe('https://www.shop.example/plain');
  });

  it('rejects non-web source URLs', () => {
    const { document, image } = fixture(noMetadataProductPage);
    expect(() => extractProductMetadata(document, image, 'file:///private/product')).toThrow(
      'Unsupported product page URL.',
    );
  });
});
