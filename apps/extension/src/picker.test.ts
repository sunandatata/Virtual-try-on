import { describe, expect, it, vi } from 'vitest';
import { isEligibleImage, startGarmentPicker } from './picker';

function image(width: number, height: number, alt = 'dress') {
  const element = document.createElement('img');
  element.src = 'https://shop.example/dress.jpg';
  element.alt = alt;
  Object.defineProperty(element, 'naturalWidth', { value: width });
  Object.defineProperty(element, 'naturalHeight', { value: height });
  element.getBoundingClientRect = () => ({ width, height }) as DOMRect;
  document.body.append(element);
  return element;
}

describe('garment picker', () => {
  it('filters tiny and decorative images', () => {
    expect(isEligibleImage(image(16, 16, 'icon'))).toBe(false);
    expect(isEligibleImage(image(400, 500, 'product dress'))).toBe(true);
    expect(isEligibleImage(image(400, 500, 'customer avatar'))).toBe(false);
  });

  it('selects, prevents navigation, and removes injected UI', () => {
    document.body.innerHTML = '';
    const product = image(400, 500);
    const selected = vi.fn();
    startGarmentPicker(selected);
    product.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected).toHaveBeenCalledWith(
      expect.objectContaining({ alt: 'dress' }),
      expect.objectContaining({ sourceUrl: 'http://localhost:3000/' }),
    );
    expect(document.querySelector('[data-virtual-try-on-picker]')).toBeNull();
  });
});
