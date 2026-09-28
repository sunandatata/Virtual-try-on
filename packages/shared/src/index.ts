import { z } from 'zod';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const garmentCategorySchema = z.enum(['dress', 'top', 'bottom']);
export type GarmentCategory = z.infer<typeof garmentCategorySchema>;

export const providerCategorySchema = z.enum(['one-pieces', 'tops', 'bottoms']);
export type ProviderCategory = z.infer<typeof providerCategorySchema>;

export function toProviderCategory(category: GarmentCategory): ProviderCategory {
  return { dress: 'one-pieces', top: 'tops', bottom: 'bottoms' }[category] as ProviderCategory;
}

export const generationStatusSchema = z.enum([
  'idle',
  'submitting',
  'processing',
  'succeeded',
  'failed',
]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN_ORIGIN',
  'RATE_LIMITED',
  'INVALID_IMAGE',
  'INVALID_TOKEN',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: apiErrorCodeSchema, message: z.string(), retryable: z.boolean() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const submitResponseSchema = z.object({
  ok: z.literal(true),
  jobToken: z.string().min(1),
  status: z.literal('processing'),
  provider: z.enum(['mock', 'fashn']),
});
export type SubmitResponse = z.infer<typeof submitResponseSchema>;

export const statusResponseSchema = z.object({
  ok: z.literal(true),
  status: z.enum(['processing', 'succeeded', 'failed']),
  resultUrl: z.string().optional(),
  isDemo: z.boolean().optional(),
  error: z.string().optional(),
});
export type StatusResponse = z.infer<typeof statusResponseSchema>;

export const imageReferenceSchema = z.object({
  src: z.string().min(1),
  alt: z.string().max(500),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type ImageReference = z.infer<typeof imageReferenceSchema>;

export const metadataSuggestionSourceSchema = z.enum([
  'json-ld',
  'open-graph',
  'nearby-content',
  'image-alt',
  'page-title',
  'hostname',
]);
export const metadataSuggestionSchema = z.object({
  value: z.string().min(1).max(500),
  source: metadataSuggestionSourceSchema,
  confidence: z.enum(['high', 'medium', 'low']),
});
export const productMetadataSchema = z.object({
  productName: metadataSuggestionSchema.optional(),
  displayedPrice: metadataSuggestionSchema.optional(),
  color: metadataSuggestionSchema.optional(),
  store: metadataSuggestionSchema,
  sourceUrl: z.string().url().max(2048),
  hostname: z.string().min(1).max(253),
  warnings: z.array(z.string().min(1).max(300)).max(10),
});
export type ProductMetadata = z.infer<typeof productMetadataSchema>;

export const extensionMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('OPEN_PICKER') }),
  z.object({ type: z.literal('PICKER_CANCELLED') }),
  z.object({
    type: z.literal('GARMENT_SELECTED'),
    image: imageReferenceSchema,
    metadata: productMetadataSchema,
  }),
  z.object({
    type: z.literal('GARMENT_BYTES'),
    dataUrl: z.string(),
    sourceUrl: z.string(),
    metadata: productMetadataSchema.optional(),
  }),
  z.object({ type: z.literal('GARMENT_FETCH_FAILED'), reason: z.string() }),
  z.object({ type: z.literal('GET_PENDING_GARMENT') }),
  z.object({ type: z.literal('CLEAR_PENDING_GARMENT') }),
]);
export type ExtensionMessage = z.infer<typeof extensionMessageSchema>;

export type ApiResult<T> = T | ApiError;
