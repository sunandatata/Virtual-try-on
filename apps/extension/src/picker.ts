import type { ImageReference } from '@virtual-try-on/shared';
import type { ProductMetadata } from '@virtual-try-on/shared';
import { extractProductMetadata } from './product-metadata';

const MIN_EDGE = 100;
const MIN_AREA = 24_000;

export function isEligibleImage(image: HTMLImageElement): boolean {
  const rect = image.getBoundingClientRect();
  const width = Math.max(rect.width, image.naturalWidth);
  const height = Math.max(rect.height, image.naturalHeight);
  if (!image.currentSrc && !image.src) return false;
  if (width < MIN_EDGE || height < MIN_EDGE || width * height < MIN_AREA) return false;
  const alt = image.alt.toLowerCase();
  return !/(avatar|icon|logo|sprite|tracking|pixel)/i.test(`${alt} ${image.className}`);
}

export function startGarmentPicker(
  onSelect: (image: ImageReference, metadata: ProductMetadata) => void,
): () => void {
  const eligible = [...document.images].filter(isEligibleImage);
  const changedTabIndex = new Map<HTMLImageElement, string | null>();
  const previousOutline = new Map<HTMLImageElement, string>();
  let active: HTMLImageElement | null = null;

  const host = document.createElement('div');
  host.dataset.virtualTryOnPicker = 'true';
  const shadow = host.attachShadow({ mode: 'closed' });
  const banner = document.createElement('div');
  banner.setAttribute('role', 'status');
  banner.textContent = 'Select a clothing image — Esc to cancel';
  const style = document.createElement('style');
  style.textContent = `div{position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);background:#2f2328;color:#fff;padding:12px 18px;border-radius:999px;font:600 14px/1.2 system-ui;box-shadow:0 8px 30px #0004}`;
  shadow.append(style, banner);
  document.documentElement.append(host);

  for (const image of eligible) {
    changedTabIndex.set(image, image.getAttribute('tabindex'));
    if (!image.hasAttribute('tabindex')) image.tabIndex = 0;
    image.setAttribute(
      'aria-label',
      image.alt ? `Select garment: ${image.alt}` : 'Select this garment image',
    );
  }

  const find = (target: EventTarget | null) =>
    target instanceof HTMLImageElement && eligible.includes(target) ? target : null;
  const highlight = (image: HTMLImageElement | null) => {
    if (active && active !== image) active.style.outline = previousOutline.get(active) ?? '';
    if (image) {
      if (!previousOutline.has(image)) previousOutline.set(image, image.style.outline);
      image.style.outline = '4px solid #c97455';
      image.style.outlineOffset = '3px';
    }
    active = image;
  };
  const onPointer = (event: Event) => highlight(find(event.target));
  const onClick = (event: MouseEvent) => {
    const image = find(event.target);
    if (!image) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const rect = image.getBoundingClientRect();
    onSelect(
      {
        src: image.currentSrc || image.src,
        alt: image.alt,
        width: rect.width,
        height: rect.height,
      },
      extractProductMetadata(document, image),
    );
    cleanup();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cleanup();
    if ((event.key === 'Enter' || event.key === ' ') && find(event.target)) {
      event.preventDefault();
      (event.target as HTMLImageElement).click();
    }
  };
  const cleanup = () => {
    document.removeEventListener('mouseover', onPointer, true);
    document.removeEventListener('focusin', onPointer, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    host.remove();
    for (const image of eligible) {
      image.style.outline = previousOutline.get(image) ?? '';
      image.style.outlineOffset = '';
      image.removeAttribute('aria-label');
      const previous = changedTabIndex.get(image);
      if (previous === null) image.removeAttribute('tabindex');
      else if (previous !== undefined) image.setAttribute('tabindex', previous);
    }
  };

  document.addEventListener('mouseover', onPointer, true);
  document.addEventListener('focusin', onPointer, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  return cleanup;
}
