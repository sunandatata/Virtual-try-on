import { describe, expect, it } from 'vitest';
import { calculateScreenshotCrop } from './screenshot-crop';

describe('calculateScreenshotCrop', () => {
  it('scales CSS viewport coordinates to high-DPI screenshot pixels', () => {
    expect(
      calculateScreenshotCrop(
        {
          rect: { x: 100, y: 50, width: 200, height: 300 },
          viewport: { width: 1000, height: 500 },
        },
        { width: 2000, height: 1000 },
      ),
    ).toEqual({ x: 200, y: 100, width: 400, height: 600 });
  });

  it('uses independent horizontal and vertical scale for zoomed captures', () => {
    expect(
      calculateScreenshotCrop(
        {
          rect: { x: 40, y: 30, width: 200, height: 100 },
          viewport: { width: 800, height: 600 },
        },
        { width: 1200, height: 1200 },
      ),
    ).toEqual({ x: 60, y: 60, width: 300, height: 200 });
  });

  it('rejects images that are partly outside the visible viewport', () => {
    expect(() =>
      calculateScreenshotCrop(
        {
          rect: { x: -10, y: 20, width: 120, height: 120 },
          viewport: { width: 800, height: 600 },
        },
        { width: 1600, height: 1200 },
      ),
    ).toThrow('Bring the full product image into view');
  });
});
