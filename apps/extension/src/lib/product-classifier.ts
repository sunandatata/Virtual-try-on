import type {
  ApparelCategory,
  AccessoryCategory,
  BeautyCategory,
  ProductClassification,
  ProductGroup,
} from '@virtual-try-on/shared';
import type { ProductMetadata } from '@virtual-try-on/shared';

type Category = ApparelCategory | AccessoryCategory | BeautyCategory | null;

// Keyword sets keyed by [group, category] for scoring
const BEAUTY_KEYWORDS: Array<{ pattern: RegExp; category: BeautyCategory }> = [
  { pattern: /\blip\s*stick\b/i, category: 'lipstick' },
  { pattern: /\blip\s*gloss\b/i, category: 'lip-gloss' },
  { pattern: /\blip\s*liner\b/i, category: 'lip-liner' },
  { pattern: /\bconcealer\b/i, category: 'concealer' },
  { pattern: /\bfoundation\b/i, category: 'foundation' },
  { pattern: /\bblush\b/i, category: 'blush' },
  { pattern: /\beyeshadow\b|\beye\s*shadow\b/i, category: 'eyeshadow' },
  { pattern: /\beyeliner\b|\beye\s*liner\b/i, category: 'eyeliner' },
];

const ACCESSORY_KEYWORDS: Array<{ pattern: RegExp; category: AccessoryCategory }> = [
  {
    pattern: /\bshoes?\b|\bsneakers?\b|\bboots?\b|\bheels?\b|\bsandals?\b|\bflats?\b/i,
    category: 'shoes',
  },
  { pattern: /\bhats?\b|\bcaps?\b|\bbeanie\b|\bfedora\b|\btoque\b/i, category: 'hat' },
  { pattern: /\bbags?\b|\bhandbag\b|\bpurse\b|\btote\b|\bclutch\b|\bbackpack\b/i, category: 'bag' },
  { pattern: /\bnecklace\b|\bchain\b|\bpendant\b/i, category: 'necklace' },
  { pattern: /\bearrings?\b|\bstud\b|\bhoop\b/i, category: 'earrings' },
  {
    pattern: /\bjewel(?:r?y|ler?y)\b|\bbracelet\b|\bwatch\b|\bring\b|\bbrooch\b/i,
    category: 'accessory',
  },
];

const APPAREL_KEYWORDS: Array<{ pattern: RegExp; category: ApparelCategory }> = [
  {
    pattern: /\bdress(?:es)?\b|\bgown\b|\bfrock\b|\bmaxi\b|\bjumpsuit\b|\boverall\b|\bromper\b/i,
    category: 'dress',
  },
  {
    pattern:
      /\bt-?shirt\b|\btop\b|\bblouse\b|\btank\b|\btunic\b|\bcamisole\b|\bcrop\b|\bsweater\b|\bpullover\b|\bknitwear\b/i,
    category: 'top',
  },
  {
    pattern:
      /\bpants?\b|\bjeans?\b|\btrousers?\b|\bskirt\b|\bshorts?\b|\bleggings?\b|\bcargos?\b|\bchinos?\b/i,
    category: 'bottom',
  },
  {
    pattern: /\bjacket\b|\bcoat\b|\bparka\b|\bblazer\b|\bovercoat\b|\btrench\b|\bwindbreaker\b/i,
    category: 'outerwear',
  },
  {
    pattern: /\boutfit\b|\bsuit\b|\bco-?ord\b|\bset\b.*(?:top|bottom|dress)/i,
    category: 'full-outfit',
  },
];

const UNSUPPORTED_PATTERNS: RegExp[] = [
  /\bperfume\b|\bfragrance\b|\bcologne\b|\beau\s*de\b/i,
  /\bshampoo\b|\bconditioner\b|\bhair\s*(?:care|mask|oil|serum)\b/i,
  /\bskincare\b|\bserum\b|\bmoisturizer\b|\bsunscreen\b|\bspf\b|\bface\s*(?:wash|mask|cream|oil)\b/i,
  /\bphone\b|\biphone\b|\bandroid\b|\btablet\b|\blaptop\b|\bcamera\b|\belectronic\b|\bheadphone\b|\bearbuds?\b|\bairpods?\b/i,
  /\bhome\s*(?:decor|goods?)\b|\bfurniture\b|\bcushion\b|\bpillow\b|\bcandle\b/i,
  /\bvitamin\b|\bsupplement\b|\bprotein\b|\bnutrition\b/i,
  /\bbook\b|\bnovel\b|\bmagazine\b/i,
];

// Beauty-specific store patterns
const BEAUTY_STORES: RegExp[] = [
  /sephora/i,
  /ulta/i,
  /nykaa/i,
  /purplle/i,
  /beautybay/i,
  /lookfantastic/i,
];

// Scoring helpers

type Hit = { category: Category; group: ProductGroup; evidence: string; score: number };

function scoreText(text: string): Hit[] {
  const hits: Hit[] = [];

  for (const { pattern, category } of BEAUTY_KEYWORDS) {
    if (pattern.test(text)) {
      hits.push({
        group: 'beauty',
        category,
        evidence: `keyword match: "${text.match(pattern)?.[0]}"`,
        score: 3,
      });
    }
  }
  for (const { pattern, category } of ACCESSORY_KEYWORDS) {
    if (pattern.test(text)) {
      hits.push({
        group: 'accessory',
        category,
        evidence: `keyword match: "${text.match(pattern)?.[0]}"`,
        score: 2,
      });
    }
  }
  for (const { pattern, category } of APPAREL_KEYWORDS) {
    if (pattern.test(text)) {
      hits.push({
        group: 'apparel',
        category,
        evidence: `keyword match: "${text.match(pattern)?.[0]}"`,
        score: 2,
      });
    }
  }
  for (const pattern of UNSUPPORTED_PATTERNS) {
    if (pattern.test(text)) {
      hits.push({
        group: 'unsupported',
        category: null,
        evidence: `unsupported keyword: "${text.match(pattern)?.[0]}"`,
        score: 3,
      });
    }
  }

  return hits;
}

export function classifyProduct(
  metadata: Pick<ProductMetadata, 'productName' | 'color' | 'store' | 'hostname'>,
): ProductClassification {
  const allHits: Hit[] = [];
  const textSources: Array<{ text: string; weight: number }> = [];

  if (metadata.productName?.value) {
    textSources.push({ text: metadata.productName.value, weight: 3 });
  }
  if (metadata.color?.value) {
    textSources.push({ text: metadata.color.value, weight: 1 });
  }
  if (metadata.store?.value) {
    textSources.push({ text: metadata.store.value, weight: 1 });
  }

  for (const { text, weight } of textSources) {
    for (const hit of scoreText(text)) {
      allHits.push({ ...hit, score: hit.score * weight });
    }
  }

  // Hostname/store boosts
  if (BEAUTY_STORES.some((re) => re.test(metadata.hostname))) {
    allHits.push({
      group: 'beauty',
      category: null,
      evidence: `beauty retailer: ${metadata.hostname}`,
      score: 1,
    });
  }

  if (allHits.length === 0) {
    return {
      group: 'apparel',
      category: 'dress',
      confidence: 'low',
      evidence: ['no matching keywords; defaulting to apparel'],
    };
  }

  // Tally by group
  const groupScores = new Map<ProductGroup, number>();
  for (const hit of allHits) {
    groupScores.set(hit.group, (groupScores.get(hit.group) ?? 0) + hit.score);
  }

  let topGroup: ProductGroup = 'unsupported';
  let topScore = 0;
  for (const [group, score] of groupScores) {
    if (score > topScore) {
      topScore = score;
      topGroup = group;
    }
  }

  // Find best category within winning group
  const groupHits = allHits.filter((h) => h.group === topGroup);
  const categoryScores = new Map<string, number>();
  for (const hit of groupHits) {
    if (hit.category !== null) {
      categoryScores.set(hit.category, (categoryScores.get(hit.category) ?? 0) + hit.score);
    }
  }
  let bestCategory: Category = null;
  let bestCategoryScore = 0;
  for (const [cat, score] of categoryScores) {
    if (score > bestCategoryScore) {
      bestCategoryScore = score;
      bestCategory = cat as Category;
    }
  }

  // Confidence: high if top group score >= 6, medium >= 3, else low
  const totalScore = [...groupScores.values()].reduce((a, b) => a + b, 0);
  const ratio = totalScore > 0 ? topScore / totalScore : 0;
  const confidence =
    topScore >= 6 || ratio >= 0.9 ? 'high' : topScore >= 3 || ratio >= 0.6 ? 'medium' : 'low';

  const evidence = groupHits.slice(0, 5).map((h) => h.evidence);

  return { group: topGroup, category: bestCategory, confidence, evidence };
}
