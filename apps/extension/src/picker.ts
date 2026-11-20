import type { ImageReference, PickerCapture } from '@virtual-try-on/shared';
import type { ProductMetadata } from '@virtual-try-on/shared';
import { extractProductMetadata } from './product-metadata';

const MIN_EDGE = 96;
const MIN_AREA = 24_000;
const TINY_DISPLAY_EDGE = 72;
const DECORATIVE =
  /(avatar|icon|logo|sprite|tracking|pixel|rating|stars?|payment|badge|social|shipping|flag|spinner)/i;
const LAZY_SOURCES = ['data-original', 'data-lazy-src', 'data-src', 'data-url'];
const HIGH_RES_SOURCES = [
  'data-zoom-image',
  'data-hi-res-src',
  'data-large-image',
  'data-full-src',
];
const LAZY_SRCSETS = [
  'data-zoom-srcset',
  'data-lazy-srcset',
  'data-srcset',
  'data-original-srcset',
  'srcset',
];

type FrameBridge = HTMLIFrameElement;
type PickCandidate = {
  element: HTMLElement;
  image?: HTMLImageElement;
  document: Document;
  frames: FrameBridge[];
  src: string;
  alt: string;
  width: number;
  height: number;
};

type Bounds = { x: number; y: number; width: number; height: number };
type Viewport = { width: number; height: number };

function metadataPageUrl(document: Document): string {
  let context: Document | undefined = document;
  while (context) {
    if (/^https?:$/.test(context.location.protocol)) return context.location.href;
    try {
      context = context.defaultView?.frameElement?.ownerDocument;
    } catch {
      context = undefined;
    }
  }
  return 'https://fixture.virtual-try-on.invalid/products/synthetic';
}

function parseSrcSet(value: string): string | undefined {
  const candidates = value
    .split(',')
    .map((part) => {
      const [url, descriptor] = part.trim().split(/\s+/);
      if (!url) return undefined;
      const score = descriptor?.endsWith('w')
        ? Number.parseFloat(descriptor)
        : descriptor?.endsWith('x')
          ? Number.parseFloat(descriptor) * 1000
          : 0;
      return { url, score: Number.isFinite(score) ? score : 0 };
    })
    .filter((candidate): candidate is { url: string; score: number } => Boolean(candidate));
  return candidates.sort((a, b) => b.score - a.score)[0]?.url;
}

function resolveSource(document: Document, value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new URL(value.trim(), document.baseURI).href;
  } catch {
    return '';
  }
}

function imageSource(image: HTMLImageElement): string {
  const document = image.ownerDocument;
  const highResolution = HIGH_RES_SOURCES.map((attribute) => image.getAttribute(attribute)).find(
    Boolean,
  );
  const lazySrc = LAZY_SOURCES.map((attribute) => image.getAttribute(attribute)).find(Boolean);
  const lazySet = LAZY_SRCSETS.map((attribute) => image.getAttribute(attribute)).find(Boolean);
  const parentSource = image
    .closest('picture')
    ?.querySelector('source[srcset], source[data-srcset]');
  const responsive =
    (lazySet && parseSrcSet(lazySet)) ??
    (parentSource &&
      parseSrcSet(
        parentSource.getAttribute('data-srcset') ?? parentSource.getAttribute('srcset') ?? '',
      )) ??
    undefined;
  const preferred =
    (highResolution && resolveSource(document, highResolution)) ||
    (responsive && resolveSource(document, responsive)) ||
    (image.currentSrc && resolveSource(document, image.currentSrc)) ||
    (lazySrc && resolveSource(document, lazySrc)) ||
    resolveSource(document, image.getAttribute('src'));
  return preferred;
}

function backgroundSource(element: HTMLElement): string {
  const view = element.ownerDocument.defaultView;
  if (!view) return '';
  const background = view.getComputedStyle(element).backgroundImage;
  const match = /url\((?:['"])?([^'")]+)(?:['"])?\)/i.exec(background);
  return resolveSource(element.ownerDocument, match?.[1]);
}

function labelFor(element: HTMLElement, image?: HTMLImageElement): string {
  if (image?.alt) return image.alt.slice(0, 500);
  return (
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.querySelector('img[alt]')?.getAttribute('alt') ??
    ''
  )
    .trim()
    .slice(0, 500);
}

function eligibleDimensions(
  element: HTMLElement,
  image?: HTMLImageElement,
):
  | {
      width: number;
      height: number;
    }
  | undefined {
  const rect = element.getBoundingClientRect();
  const displayWidth = rect.width;
  const displayHeight = rect.height;
  if (displayWidth < TINY_DISPLAY_EDGE || displayHeight < TINY_DISPLAY_EDGE) return undefined;
  const width = Math.max(displayWidth, image?.naturalWidth ?? 0);
  const height = Math.max(displayHeight, image?.naturalHeight ?? 0);
  if (width < MIN_EDGE || height < MIN_EDGE || width * height < MIN_AREA) return undefined;
  if (width / height > 6 || height / width > 6) return undefined;
  return { width, height };
}

function makeCandidate(
  element: HTMLElement,
  document: Document,
  frames: FrameBridge[],
): PickCandidate | undefined {
  const image = element.tagName.toLowerCase() === 'img' ? (element as HTMLImageElement) : undefined;
  const src =
    element.tagName.toLowerCase() === 'canvas'
      ? 'canvas://selected'
      : image
        ? imageSource(image)
        : backgroundSource(element);
  if (!src || /^(?:javascript:|about:|chrome:|chrome-extension:)/i.test(src)) return undefined;
  const view = document.defaultView;
  if (!view) return undefined;
  const style = view.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return undefined;
  }
  const alt = labelFor(element, image);
  const clue = `${alt} ${element.id} ${element.className} ${src}`;
  if (DECORATIVE.test(clue)) return undefined;
  const size = eligibleDimensions(element, image);
  if (!size) return undefined;
  return { element, image, document, frames, src, alt, ...size };
}

export function isEligibleImage(image: HTMLImageElement): boolean {
  return Boolean(makeCandidate(image, image.ownerDocument, []));
}

function candidateForTarget(
  target: EventTarget | null,
  context: DocumentContext,
): PickCandidate | null {
  const view = context.document.defaultView;
  const ElementConstructor = view?.Element;
  if (!ElementConstructor || !(target instanceof ElementConstructor)) return null;
  const element = target as Element;
  const image = element.closest('img');
  if (image)
    return makeCandidate(image as HTMLImageElement, context.document, context.frames) ?? null;

  let current: Element | null = element;
  while (
    current &&
    current !== context.document.body &&
    current !== context.document.documentElement
  ) {
    const candidate = makeCandidate(current as HTMLElement, context.document, context.frames);
    if (candidate) return candidate;
    current = current.parentElement;
  }
  return null;
}

type DocumentContext = { document: Document; frames: FrameBridge[] };

function pageDocuments(root: Document): DocumentContext[] {
  const contexts: DocumentContext[] = [{ document: root, frames: [] }];
  const seen = new Set<Document>([root]);
  for (let index = 0; index < contexts.length; index += 1) {
    const context = contexts[index]!;
    for (const frame of context.document.querySelectorAll('iframe')) {
      try {
        const child = frame.contentDocument;
        if (child && !seen.has(child)) {
          seen.add(child);
          contexts.push({ document: child, frames: [...context.frames, frame] });
        }
      } catch {
        // Cross-origin frames remain outside the retailer page’s DOM access.
      }
    }
  }
  return contexts;
}

function topBounds(candidate: PickCandidate): { rect: Bounds; viewport: Viewport } | undefined {
  const rect = candidate.element.getBoundingClientRect();
  let x = rect.left;
  let y = rect.top;
  let width = rect.width;
  let height = rect.height;
  for (let index = candidate.frames.length - 1; index >= 0; index -= 1) {
    const frame = candidate.frames[index]!;
    const frameRect = frame.getBoundingClientRect();
    const childWindow = frame.contentWindow;
    if (!childWindow) return undefined;
    const scaleX = frame.clientWidth / Math.max(childWindow.innerWidth, 1);
    const scaleY = frame.clientHeight / Math.max(childWindow.innerHeight, 1);
    x = frameRect.left + frame.clientLeft + x * scaleX;
    y = frameRect.top + frame.clientTop + y * scaleY;
    width *= scaleX;
    height *= scaleY;
  }
  const topDocument = candidate.frames[0]?.ownerDocument ?? candidate.document;
  const view = topDocument.defaultView;
  if (!view) return undefined;
  const visual = view.visualViewport;
  if (candidate.frames.length > 0) {
    // Frame transforms above produce coordinates relative to the top layout viewport.
  }
  const offsetX = visual?.offsetLeft ?? 0;
  const offsetY = visual?.offsetTop ?? 0;
  const viewport = {
    width: visual?.width || view.innerWidth,
    height: visual?.height || view.innerHeight,
  };
  return { rect: { x: x - offsetX, y: y - offsetY, width, height }, viewport };
}

function fullyVisible(rect: Bounds, viewport: Viewport): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= viewport.width &&
    rect.y + rect.height <= viewport.height
  );
}

export type PageImageDetails =
  | {
      ok: true;
      image: ImageReference;
      metadata: ProductMetadata;
      capture?: PickerCapture;
    }
  | { ok: false };

export function getPageImageDetails(rootDocument: Document, rawSource: string): PageImageDetails {
  const expected = resolveSource(rootDocument, rawSource);
  if (!expected) return { ok: false };
  for (const context of pageDocuments(rootDocument)) {
    for (const image of context.document.images) {
      const candidate = makeCandidate(image, context.document, context.frames);
      if (!candidate) continue;
      const sources = [
        image.currentSrc,
        image.src,
        ...HIGH_RES_SOURCES.map((attribute) => image.getAttribute(attribute) ?? ''),
        ...LAZY_SOURCES.map((attribute) => image.getAttribute(attribute) ?? ''),
        ...LAZY_SRCSETS.map((attribute) => parseSrcSet(image.getAttribute(attribute) ?? '')).filter(
          (value): value is string => Boolean(value),
        ),
        candidate.src,
      ].map((source) => resolveSource(context.document, source));
      if (!sources.includes(expected)) continue;
      const bounds = topBounds(candidate);
      const visible = bounds && fullyVisible(bounds.rect, bounds.viewport);
      return {
        ok: true,
        image: {
          src: candidate.src,
          alt: candidate.alt,
          width: candidate.width,
          height: candidate.height,
        },
        metadata: extractProductMetadata(
          context.document,
          image,
          metadataPageUrl(context.document),
          candidate.src,
        ),
        ...(visible && bounds ? { capture: { rect: bounds.rect, viewport: bounds.viewport } } : {}),
      };
    }
  }
  return { ok: false };
}

function renderedImageBounds(candidate: PickCandidate): Bounds {
  const rect = candidate.element.getBoundingClientRect();
  const image = candidate.image;
  if (!image || !image.naturalWidth || !image.naturalHeight) {
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }
  const view = image.ownerDocument.defaultView;
  if (!view || view.getComputedStyle(image).objectFit !== 'contain') {
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const position = view.getComputedStyle(image).objectPosition.split(/\s+/);
  const percent = (value: string | undefined): number => {
    if (!value) return 0.5;
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return 1;
    if (value === 'center') return 0.5;
    if (value.endsWith('%')) return Math.max(0, Math.min(1, Number.parseFloat(value) / 100));
    return 0.5;
  };
  return {
    x: rect.left + (rect.width - width) * percent(position[0]),
    y: rect.top + (rect.height - height) * percent(position[1] ?? position[0]),
    width,
    height,
  };
}

export function startGarmentPicker(
  onSelect: (image: ImageReference, metadata: ProductMetadata, capture: PickerCapture) => void,
  rootDocument: Document = document,
): () => void {
  const contexts = pageDocuments(rootDocument);
  const changedTabIndex = new Map<HTMLImageElement, string | null>();
  const changedAriaLabel = new Map<HTMLImageElement, string | null>();
  const observers: MutationObserver[] = [];
  const pointerHandlers = new Map<Document, (event: Event) => void>();
  const clickHandlers = new Map<Document, (event: MouseEvent) => void>();
  const keyHandlers = new Map<Document, (event: KeyboardEvent) => void>();

  const host = rootDocument.createElement('div');
  host.dataset.virtualTryOnPicker = 'true';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = rootDocument.createElement('style');
  style.textContent = `:host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none}.highlight{position:fixed;border:4px solid #c97455;background:#c9745526;border-radius:4px;box-shadow:0 0 0 9999px #10101008;box-sizing:border-box}.banner{position:fixed;top:16px;left:50%;transform:translateX(-50%);max-width:min(90vw,640px);display:flex;align-items:center;gap:14px;background:#2f2328;color:#fff;padding:12px 16px;border-radius:16px;font:600 14px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px #0005;pointer-events:auto}.banner button{border:1px solid #fff8;border-radius:8px;background:transparent;color:#fff;padding:6px 10px;font:inherit;cursor:pointer}`;
  const highlight = rootDocument.createElement('div');
  highlight.className = 'highlight';
  highlight.hidden = true;
  const banner = rootDocument.createElement('div');
  banner.className = 'banner';
  banner.setAttribute('role', 'status');
  const message = rootDocument.createElement('span');
  message.textContent = 'Click a product image to select it. Press Escape to cancel.';
  const cancel = rootDocument.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  banner.append(message, cancel);
  shadow.append(style, highlight, banner);
  rootDocument.documentElement.append(host);

  const registerImage = (image: HTMLImageElement, context: DocumentContext) => {
    if (!makeCandidate(image, context.document, context.frames)) return;
    if (!changedTabIndex.has(image)) {
      changedTabIndex.set(image, image.getAttribute('tabindex'));
      changedAriaLabel.set(image, image.getAttribute('aria-label'));
    }
    if (!image.hasAttribute('tabindex')) image.tabIndex = 0;
    if (!image.hasAttribute('aria-label')) {
      image.setAttribute(
        'aria-label',
        image.alt ? `Select product image: ${image.alt}` : 'Select product image',
      );
    }
  };
  const makeFocusable = (root: ParentNode, context: DocumentContext) => {
    if (root instanceof (context.document.defaultView?.HTMLImageElement ?? HTMLImageElement)) {
      registerImage(root as HTMLImageElement, context);
    }
    for (const image of root.querySelectorAll('img')) {
      registerImage(image, context);
    }
  };
  for (const context of contexts) {
    makeFocusable(context.document, context);
    const MutationObserverConstructor = context.document.defaultView?.MutationObserver;
    if (MutationObserverConstructor) {
      const ElementConstructor = context.document.defaultView?.Element;
      if (!ElementConstructor) continue;
      const observer = new MutationObserverConstructor((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof ElementConstructor) {
              makeFocusable(node, context);
            }
          }
          if (record.target instanceof ElementConstructor) {
            const target = record.target.closest('img');
            if (target) makeFocusable(target.parentElement ?? target, context);
          }
        }
      });
      observer.observe(context.document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset', 'data-zoom-image'],
      });
      observers.push(observer);
    }
  }

  const updateHighlight = (candidate: PickCandidate | null) => {
    if (!candidate) {
      highlight.hidden = true;
      return;
    }
    const rect = candidate.frames.length
      ? topBounds(candidate)?.rect
      : renderedImageBounds(candidate);
    if (!rect) {
      highlight.hidden = true;
      return;
    }
    highlight.hidden = false;
    highlight.style.left = `${rect.x}px`;
    highlight.style.top = `${rect.y}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  };

  const onPointer = (context: DocumentContext) => (event: Event) => {
    if (host.contains(event.target as Node)) return;
    updateHighlight(candidateForTarget(event.target, context));
  };
  const onClick = (context: DocumentContext) => (event: MouseEvent) => {
    if (host.contains(event.target as Node)) return;
    const candidate = candidateForTarget(event.target, context);
    if (!candidate) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const top = topBounds(candidate);
    if (!top || !fullyVisible(top.rect, top.viewport)) {
      message.textContent = 'Bring the full product image into view, then click it again.';
      return;
    }
    const rendered = candidate.frames.length ? top.rect : renderedImageBounds(candidate);
    const captureRect = candidate.frames.length
      ? top.rect
      : {
          x: rendered.x - (candidate.document.defaultView?.visualViewport?.offsetLeft ?? 0),
          y: rendered.y - (candidate.document.defaultView?.visualViewport?.offsetTop ?? 0),
          width: rendered.width,
          height: rendered.height,
        };
    const capture: PickerCapture = { rect: captureRect, viewport: top.viewport };
    const image: ImageReference = {
      src: candidate.src,
      alt: candidate.alt,
      width: candidate.width,
      height: candidate.height,
    };
    const metadata = extractProductMetadata(
      candidate.document,
      candidate.element,
      metadataPageUrl(candidate.document),
      candidate.src,
    );
    cleanup();
    onSelect(image, metadata, capture);
  };
  const onKey = (context: DocumentContext) => (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      cleanup();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const candidate = candidateForTarget(event.target, context);
    if (!candidate) return;
    event.preventDefault();
    candidate.element.click();
  };
  const pointerHandler = (context: DocumentContext) => {
    let handler = pointerHandlers.get(context.document);
    if (!handler) {
      handler = onPointer(context);
      pointerHandlers.set(context.document, handler);
    }
    return handler;
  };
  const clickHandler = (context: DocumentContext) => {
    let handler = clickHandlers.get(context.document);
    if (!handler) {
      handler = onClick(context);
      clickHandlers.set(context.document, handler);
    }
    return handler;
  };
  const keyHandler = (context: DocumentContext) => {
    let handler = keyHandlers.get(context.document);
    if (!handler) {
      handler = onKey(context);
      keyHandlers.set(context.document, handler);
    }
    return handler;
  };
  const cleanup = () => {
    for (const observer of observers) observer.disconnect();
    for (const context of contexts) {
      context.document.removeEventListener('mouseover', onPointer(context), true);
    }
    for (const image of changedTabIndex.keys()) {
      const tabIndex = changedTabIndex.get(image);
      if (tabIndex === null) image.removeAttribute('tabindex');
      else if (tabIndex !== undefined) image.setAttribute('tabindex', tabIndex);
      const ariaLabel = changedAriaLabel.get(image);
      if (ariaLabel === null) image.removeAttribute('aria-label');
      else if (ariaLabel !== undefined) image.setAttribute('aria-label', ariaLabel);
    }
    for (const context of contexts) {
      context.document.removeEventListener('mouseover', pointerHandler(context), true);
      context.document.removeEventListener('focusin', pointerHandler(context), true);
      context.document.removeEventListener('click', clickHandler(context), true);
      context.document.removeEventListener('keydown', keyHandler(context), true);
    }
    host.remove();
  };
  cancel.addEventListener('click', cleanup);
  for (const context of contexts) {
    context.document.addEventListener('mouseover', pointerHandler(context), true);
    context.document.addEventListener('focusin', pointerHandler(context), true);
    context.document.addEventListener('click', clickHandler(context), true);
    context.document.addEventListener('keydown', keyHandler(context), true);
  }
  return cleanup;
}
