import type { ProductMetadata } from '@virtual-try-on/shared';

type Suggestion = ProductMetadata['store'];
type JsonRecord = Record<string, unknown>;

const PRICE_PATTERN = /(?:[$€£¥]\s?\d[\d,.]*|\b(?:USD|EUR|GBP|CAD|AUD|JPY)\s?\d[\d,.]*)/gi;

function cleanText(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const withoutControls = [...String(value)]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('');
  const normalized = withoutControls.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function suggestion(
  value: unknown,
  source: Suggestion['source'],
  confidence: Suggestion['confidence'],
  maxLength = 500,
): Suggestion | undefined {
  const cleaned = cleanText(value, maxLength);
  return cleaned ? { value: cleaned, source, confidence } : undefined;
}

function safePageUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported product page URL.');
  url.username = '';
  url.password = '';
  url.hash = '';
  return url;
}

function records(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(records);
  if (!value || typeof value !== 'object') return [];
  const record = value as JsonRecord;
  return [record, ...records(record['@graph'])];
}

function isProduct(record: JsonRecord): boolean {
  const type = record['@type'];
  return Array.isArray(type) ? type.includes('Product') : type === 'Product';
}

function structuredProducts(document: Document): JsonRecord[] {
  const products: JsonRecord[] = [];
  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  )) {
    try {
      products.push(...records(JSON.parse(script.textContent || '')).filter(isProduct));
    } catch {
      // Invalid third-party structured data is ignored as a best-effort source.
    }
  }
  return products;
}

function imageUrls(product: JsonRecord): string[] {
  const image = product.image;
  if (typeof image === 'string') return [image];
  if (Array.isArray(image))
    return image.filter((value): value is string => typeof value === 'string');
  if (image && typeof image === 'object') {
    const url = (image as JsonRecord).url;
    return typeof url === 'string' ? [url] : [];
  }
  return [];
}

function matchingProduct(products: JsonRecord[], selectedSrc: string): JsonRecord | undefined {
  const exact = products.find((product) => imageUrls(product).some((url) => url === selectedSrc));
  return exact ?? (products.length === 1 ? products[0] : undefined);
}

function offerRecord(product?: JsonRecord): JsonRecord | undefined {
  if (!product) return undefined;
  const offers = product.offers;
  if (Array.isArray(offers))
    return offers.find((value) => value && typeof value === 'object') as JsonRecord | undefined;
  return offers && typeof offers === 'object' ? (offers as JsonRecord) : undefined;
}

function structuredPrice(product?: JsonRecord): string | undefined {
  const offer = offerRecord(product);
  if (!offer) return undefined;
  const price = cleanText(offer.price ?? offer.lowPrice, 100);
  const currency = cleanText(offer.priceCurrency, 10);
  return price ? [currency, price].filter(Boolean).join(' ') : undefined;
}

function metaContent(document: Document, ...selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = document.querySelector<HTMLMetaElement>(selector)?.content;
    if (cleanText(value)) return value;
  }
  return undefined;
}

function nearbyRoot(image: HTMLImageElement): Element {
  return (
    image.closest('[itemtype*="Product"], [data-product], article, main, section') ??
    image.parentElement ??
    image.ownerDocument.body
  );
}

function nearbyHeading(image: HTMLImageElement): string | undefined {
  const root = nearbyRoot(image);
  return root.querySelector<HTMLElement>('h1, h2, h3, [itemprop="name"]')?.textContent ?? undefined;
}

function nearbyPrices(image: HTMLImageElement): string[] {
  const root = nearbyRoot(image);
  const explicit = [...root.querySelectorAll<HTMLElement>('[itemprop="price"], [class*="price"]')]
    .flatMap((element) => [element.getAttribute('content'), element.textContent])
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.match(PRICE_PATTERN) ?? []);
  const fallback = root.textContent?.match(PRICE_PATTERN) ?? [];
  return [...new Set([...explicit, ...fallback].map((value) => cleanText(value, 100)!))];
}

export function extractProductMetadata(
  document: Document,
  selectedImage: HTMLImageElement,
  rawPageUrl = document.location.href,
): ProductMetadata {
  const pageUrl = safePageUrl(rawPageUrl);
  const products = structuredProducts(document);
  const product = matchingProduct(products, selectedImage.currentSrc || selectedImage.src);
  const warnings: string[] = [];
  const ogName = metaContent(document, 'meta[property="og:title"]');
  const nearbyName = nearbyHeading(selectedImage);
  const pageTitle = cleanText(document.title);
  const nearbyPriceValues = nearbyPrices(selectedImage);
  const jsonPrice = structuredPrice(product);
  const ogPrice = metaContent(
    document,
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
  );
  const ogCurrency = metaContent(
    document,
    'meta[property="product:price:currency"]',
    'meta[property="og:price:currency"]',
  );
  if (!jsonPrice && !ogPrice && nearbyPriceValues.length > 1) {
    warnings.push('Multiple nearby prices were found; review the price before saving.');
  }
  if (products.length > 1 && !product) {
    warnings.push('Multiple products were found; review the suggested details before saving.');
  }

  const jsonName = product?.name;
  const productName =
    suggestion(jsonName, 'json-ld', 'high') ??
    suggestion(ogName, 'open-graph', 'medium') ??
    suggestion(nearbyName, 'nearby-content', 'medium') ??
    suggestion(selectedImage.alt, 'image-alt', 'low') ??
    suggestion(pageTitle, 'page-title', 'low');
  const displayedPrice =
    suggestion(jsonPrice, 'json-ld', 'high', 100) ??
    suggestion([ogCurrency, ogPrice].filter(Boolean).join(' '), 'open-graph', 'medium', 100) ??
    (nearbyPriceValues.length === 1
      ? suggestion(nearbyPriceValues[0], 'nearby-content', 'low', 100)
      : undefined);
  const color =
    suggestion(product?.color, 'json-ld', 'high', 100) ??
    suggestion(
      metaContent(document, 'meta[property="product:color"]'),
      'open-graph',
      'medium',
      100,
    );
  const siteName = metaContent(document, 'meta[property="og:site_name"]');
  const store =
    suggestion(siteName, 'open-graph', 'medium', 200) ??
    suggestion(pageUrl.hostname.replace(/^www\./, ''), 'hostname', 'high', 253)!;

  return {
    productName,
    displayedPrice,
    color,
    store,
    sourceUrl: pageUrl.toString(),
    hostname: pageUrl.hostname,
    warnings,
  };
}
