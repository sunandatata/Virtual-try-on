import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPageImageDetails, isEligibleImage, startGarmentPicker } from './picker';

function image(
  width: number,
  height: number,
  alt = 'dress',
  src = 'https://shop.example/dress.jpg',
) {
  const element = document.createElement('img');
  element.src = src;
  element.alt = alt;
  Object.defineProperty(element, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'naturalHeight', { configurable: true, value: height });
  element.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height }) as DOMRect;
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.querySelector('[data-virtual-try-on-picker]')?.remove();
});

describe('garment picker', () => {
  it('filters tiny, decorative, and thumbnail-only images', () => {
    expect(isEligibleImage(image(16, 16, 'icon'))).toBe(false);
    expect(isEligibleImage(image(400, 500, 'product dress'))).toBe(true);
    expect(isEligibleImage(image(400, 500, 'customer avatar'))).toBe(false);
    const thumbnail = image(1200, 1600, 'product thumbnail');
    thumbnail.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: 54, bottom: 72, width: 54, height: 72 }) as DOMRect;
    expect(isEligibleImage(thumbnail)).toBe(false);
  });

  it('uses the responsive high-resolution source and records screenshot geometry', () => {
    const product = image(400, 500);
    product.setAttribute(
      'srcset',
      'https://shop.example/small.jpg 320w, https://shop.example/large.jpg 1280w',
    );
    const selected = vi.fn();
    startGarmentPicker(selected);
    product.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'https://shop.example/large.jpg', alt: 'dress' }),
      expect.objectContaining({ sourceUrl: 'http://localhost:3000/' }),
      expect.objectContaining({ rect: expect.objectContaining({ x: 0, y: 0 }) }),
    );
  });

  it('uses lazy loaded zoom sources before thumbnail sources', () => {
    const product = image(400, 500);
    product.setAttribute('data-src', 'https://shop.example/thumb.jpg');
    product.setAttribute('data-zoom-image', 'https://cdn.example/zoom.jpg');
    const selected = vi.fn();
    startGarmentPicker(selected);
    product.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected.mock.calls[0]?.[0]).toMatchObject({ src: 'https://cdn.example/zoom.jpg' });
  });

  it('allows selection of CSS background product tiles', () => {
    const tile = document.createElement('button');
    tile.setAttribute('aria-label', 'Blue floral top');
    tile.style.backgroundImage = 'url("https://cdn.example/top-large.jpg")';
    tile.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 300,
        bottom: 400,
        width: 300,
        height: 400,
      }) as DOMRect;
    document.body.append(tile);
    const selected = vi.fn();
    startGarmentPicker(selected);
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected.mock.calls[0]?.[0]).toMatchObject({
      src: 'https://cdn.example/top-large.jpg',
      alt: 'Blue floral top',
    });
  });

  it('offers a screenshot-crop candidate for canvas-rendered products', () => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Protected canvas product');
    canvas.width = 320;
    canvas.height = 420;
    canvas.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 320,
        bottom: 420,
        width: 320,
        height: 420,
      }) as DOMRect;
    document.body.append(canvas);
    const selected = vi.fn();
    startGarmentPicker(selected);
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected.mock.calls[0]?.[0]).toMatchObject({
      src: 'canvas://selected',
      alt: 'Protected canvas product',
    });
    expect(selected.mock.calls[0]?.[2]).toMatchObject({
      rect: { width: 320, height: 420 },
    });
  });

  it('recognizes images inserted after picker activation', () => {
    const selected = vi.fn();
    startGarmentPicker(selected);
    const lateProduct = image(450, 600, 'Late gallery dress');
    lateProduct.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected.mock.calls[0]?.[0]).toMatchObject({ alt: 'Late gallery dress' });
  });

  it('resolves context-menu image URLs to page metadata and crop bounds', () => {
    const product = image(420, 560, 'Context menu synthetic coat');
    const details = getPageImageDetails(document, product.src);
    expect(details).toMatchObject({
      ok: true,
      image: { src: product.src, alt: 'Context menu synthetic coat' },
      metadata: { sourceUrl: 'http://localhost:3000/' },
      capture: { rect: { width: 420, height: 560 } },
    });
  });

  it('wires selection into accessible same-origin frames', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error('Test iframe did not expose a same-origin document.');
    frameDocument.body.innerHTML =
      '<img alt="Same-origin frame garment" src="https://shop.example/frame.png">';
    const frameImage = frameDocument.querySelector<HTMLImageElement>('img')!;
    Object.defineProperty(frameImage, 'naturalWidth', { configurable: true, value: 400 });
    Object.defineProperty(frameImage, 'naturalHeight', { configurable: true, value: 500 });
    frame.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 10,
        left: 10,
        top: 10,
        right: 510,
        bottom: 610,
        width: 500,
        height: 600,
      }) as DOMRect;
    Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 500 });
    Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(frame.contentWindow, 'innerWidth', { configurable: true, value: 500 });
    Object.defineProperty(frame.contentWindow, 'innerHeight', { configurable: true, value: 600 });
    frameImage.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 500,
        width: 400,
        height: 500,
      }) as DOMRect;

    const selected = vi.fn();
    startGarmentPicker(selected);
    frameImage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected.mock.calls[0]?.[0]).toMatchObject({ alt: 'Same-origin frame garment' });
    expect(selected.mock.calls[0]?.[2].rect).toMatchObject({
      x: 10,
      y: 10,
      width: 400,
      height: 500,
    });
  });

  it('selects, prevents navigation, restores accessibility attributes, and removes isolated UI', () => {
    document.body.innerHTML = '';
    const link = document.createElement('a');
    link.href = 'https://shop.example/product';
    const product = image(400, 500);
    product.setAttribute('tabindex', '3');
    product.setAttribute('aria-label', 'Store provided name');
    link.append(product);
    document.body.append(link);
    const navigate = vi.fn();
    link.addEventListener('click', navigate);
    const selected = vi.fn();
    startGarmentPicker(selected);
    product.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(product.getAttribute('tabindex')).toBe('3');
    expect(product.getAttribute('aria-label')).toBe('Store provided name');
    expect(document.querySelector('[data-virtual-try-on-picker]')).toBeNull();
  });

  it('Escape cancels selection and cleans up listeners and injected UI', () => {
    const product = image(400, 500);
    const selected = vi.fn();
    startGarmentPicker(selected);
    expect(product.getAttribute('tabindex')).toBe('0');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[data-virtual-try-on-picker]')).toBeNull();
    expect(product.hasAttribute('tabindex')).toBe(false);
    product.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(selected).not.toHaveBeenCalled();
  });
});
