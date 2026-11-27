import { describe, expect, it } from 'vitest';
import { classifyProduct } from './product-classifier';
import type { ProductMetadata } from '@virtual-try-on/shared';

function meta(productName: string, hostname = 'shop.example.com'): Pick<ProductMetadata, 'productName' | 'color' | 'store' | 'hostname'> {
  return {
    productName: { value: productName, source: 'page-title', confidence: 'high' },
    store: { value: 'Example Store', source: 'hostname', confidence: 'high' },
    hostname,
  };
}

describe('classifyProduct', () => {
  it('classifies a dress as apparel/dress with high confidence', () => {
    const result = classifyProduct(meta('Floral Maxi Dress'));
    expect(result.group).toBe('apparel');
    expect(result.category).toBe('dress');
    expect(result.confidence).not.toBe('low');
  });

  it('classifies a top', () => {
    const result = classifyProduct(meta('Slim Fit T-Shirt'));
    expect(result.group).toBe('apparel');
    expect(result.category).toBe('top');
  });

  it('classifies jeans as bottom', () => {
    const result = classifyProduct(meta('Straight Leg Jeans'));
    expect(result.group).toBe('apparel');
    expect(result.category).toBe('bottom');
  });

  it('classifies a jacket as outerwear', () => {
    const result = classifyProduct(meta('Puffer Jacket'));
    expect(result.group).toBe('apparel');
    expect(result.category).toBe('outerwear');
  });

  it('classifies lipstick as beauty', () => {
    const result = classifyProduct(meta('Matte Red Lipstick'));
    expect(result.group).toBe('beauty');
    expect(result.category).toBe('lipstick');
  });

  it('classifies foundation as beauty', () => {
    const result = classifyProduct(meta('Full Coverage Foundation SPF 30'));
    expect(result.group).toBe('beauty');
    expect(result.category).toBe('foundation');
  });

  it('classifies eyeshadow palette as beauty/eyeshadow', () => {
    const result = classifyProduct(meta('Nude Eyeshadow Palette'));
    expect(result.group).toBe('beauty');
    expect(result.category).toBe('eyeshadow');
  });

  it('classifies sneakers as accessory/shoes', () => {
    const result = classifyProduct(meta('Running Sneakers'));
    expect(result.group).toBe('accessory');
    expect(result.category).toBe('shoes');
  });

  it('classifies a handbag as accessory/bag', () => {
    const result = classifyProduct(meta('Leather Handbag'));
    expect(result.group).toBe('accessory');
    expect(result.category).toBe('bag');
  });

  it('classifies a necklace as accessory/necklace', () => {
    const result = classifyProduct(meta('Gold Pendant Necklace'));
    expect(result.group).toBe('accessory');
    expect(result.category).toBe('necklace');
  });

  it('classifies perfume as unsupported', () => {
    const result = classifyProduct(meta('Rose Eau de Parfum'));
    expect(result.group).toBe('unsupported');
  });

  it('classifies a phone as unsupported', () => {
    const result = classifyProduct(meta('iPhone 15 Pro Max'));
    expect(result.group).toBe('unsupported');
  });

  it('classifies skincare serum as unsupported', () => {
    const result = classifyProduct(meta('Vitamin C Brightening Serum'));
    expect(result.group).toBe('unsupported');
  });

  it('boosts beauty confidence for Sephora store', () => {
    const result = classifyProduct(meta('Matte Lipstick', 'www.sephora.com'));
    expect(result.group).toBe('beauty');
  });

  it('returns evidence for classification', () => {
    const result = classifyProduct(meta('Floral Midi Dress'));
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});
