import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearImages, deleteImage, getImage, saveImage } from './storage';

describe('IndexedDB image storage', () => {
  beforeEach(async () => {
    await clearImages();
  });

  it('saves, replaces, and deletes a private body photo', async () => {
    const first = {
      slot: 'person' as const,
      blob: new Blob(['one'], { type: 'image/png' }),
      name: 'one.png',
      mime: 'image/png',
      width: 10,
      height: 10,
      updatedAt: 1,
    };
    const second = {
      ...first,
      blob: new Blob(['two'], { type: 'image/png' }),
      name: 'two.png',
      updatedAt: 2,
    };
    await saveImage(first);
    await saveImage(second);
    expect((await getImage('person'))?.name).toBe('two.png');
    await deleteImage('person');
    expect(await getImage('person')).toBeUndefined();
  });

  it('clears every image slot', async () => {
    vi.stubGlobal('chrome', undefined);
    await saveImage({
      slot: 'garment',
      blob: new Blob(['x']),
      name: 'x',
      mime: 'image/png',
      width: 1,
      height: 1,
      updatedAt: 1,
    });
    await clearImages();
    expect(await getImage('garment')).toBeUndefined();
  });
});
