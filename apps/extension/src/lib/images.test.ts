import { describe, expect, it, vi } from 'vitest';
import { processImage } from './images';

describe('local image validation', () => {
  it('rejects unsupported and oversized files before decoding', async () => {
    await expect(processImage(new Blob(['x'], { type: 'image/gif' }), 'person')).rejects.toThrow(
      /JPEG/,
    );
    const oversized = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' });
    await expect(processImage(oversized, 'person')).rejects.toThrow(/10 MB/);
  });

  it('accepts a decodable image without needless recompression', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 800, height: 1200, close }),
    );
    const blob = new Blob(['valid'], { type: 'image/png' });
    const result = await processImage(blob, 'person', 'person.png');
    expect(result.blob).toBe(blob);
    expect(result.width).toBe(800);
    expect(close).toHaveBeenCalled();
  });

  it('resizes an excessive image locally before storage', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 4096, height: 2048, close }),
    );
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    vi.spyOn(canvas, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['compressed'], { type: 'image/jpeg' }));
    });
    vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas);

    const result = await processImage(new Blob(['large'], { type: 'image/png' }), 'person');
    expect(result.width).toBe(2048);
    expect(result.height).toBe(1024);
    expect(result.mime).toBe('image/jpeg');
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
