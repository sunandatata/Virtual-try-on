import { describe, expect, it } from 'vitest';
import { canGenerate } from './state';

describe('generate button state', () => {
  it('requires both images, category, and consent', () => {
    expect(
      canGenerate({ person: true, garment: true, category: true, consent: true, status: 'idle' }),
    ).toBe(true);
    expect(
      canGenerate({ person: true, garment: true, category: true, consent: false, status: 'idle' }),
    ).toBe(false);
    expect(
      canGenerate({ person: true, garment: false, category: true, consent: true, status: 'idle' }),
    ).toBe(false);
  });

  it('blocks repeated submissions', () => {
    expect(
      canGenerate({
        person: true,
        garment: true,
        category: true,
        consent: true,
        status: 'processing',
      }),
    ).toBe(false);
    expect(
      canGenerate({ person: true, garment: true, category: true, consent: true, status: 'failed' }),
    ).toBe(true);
  });
});
