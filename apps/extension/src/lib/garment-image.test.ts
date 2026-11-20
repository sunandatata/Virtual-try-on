import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGarmentImage } from './garment-image';

function mockBitmap() {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 640, height: 900, close: vi.fn() }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('loadGarmentImage', () => {
  it('uses validated direct image bytes when the retailer allows retrieval', async () => {
    mockBitmap();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['synthetic png'], { type: 'image/png' }),
    });
    const cropper = vi.fn();

    await expect(
      loadGarmentImage({ src: 'https://cdn.example/product.png', fetcher, cropper }),
    ).resolves.toMatchObject({
      captureMethod: 'direct-image',
      width: 640,
      height: 900,
      blob: { type: 'image/png' },
    });
    expect(fetcher).toHaveBeenCalledWith('https://cdn.example/product.png', {
      credentials: 'omit',
    });
    expect(cropper).not.toHaveBeenCalled();
  });

  it('falls back to a visible-tab crop when direct fetch is blocked', async () => {
    mockBitmap();
    const capture = {
      rect: { x: 30, y: 40, width: 300, height: 400 },
      viewport: { width: 1200, height: 800 },
    };
    const fetcher = vi.fn().mockRejectedValue(new TypeError('CORS blocked'));
    const cropper = vi.fn().mockResolvedValue(new Blob(['cropped'], { type: 'image/png' }));

    await expect(
      loadGarmentImage({
        src: 'https://protected-cdn.example/product.png',
        capture,
        windowId: 5,
        fetcher,
        cropper,
      }),
    ).resolves.toMatchObject({ captureMethod: 'screenshot-crop', width: 640, height: 900 });
    expect(cropper).toHaveBeenCalledWith(5, capture);
  });

  it('does not save an unsupported full-page or arbitrary scheme as an image', async () => {
    mockBitmap();
    const fetcher = vi.fn();
    await expect(loadGarmentImage({ src: 'javascript:alert(1)', fetcher })).rejects.toThrow(
      'protected or temporary',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
