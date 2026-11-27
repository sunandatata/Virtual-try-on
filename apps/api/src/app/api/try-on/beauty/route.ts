import { z } from 'zod';
import { beautyCategorySchema } from '@virtual-try-on/shared';
import { apiError, corsHeaders, optionsResponse, verifyAccess, verifyOrigin } from '@/lib/http';
import { dataUri, validateImage } from '@/lib/images';
import { getBeautyProvider } from '@/lib/providers';
import { rateLimiter } from '@/lib/rate-limit';
import { signToken } from '@/lib/token';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

const shadeHexSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .optional();

export async function POST(request: Request) {
  const { allowed, origin } = verifyOrigin(request);
  const cors = corsHeaders(origin);
  if (!allowed) return apiError('FORBIDDEN_ORIGIN', 'This extension origin is not allowed.', 403);
  if (!verifyAccess(request))
    return apiError('UNAUTHORIZED', 'The access code is not valid.', 401, false, cors);

  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  try {
    const limit = await rateLimiter().check(client);
    if (!limit.allowed) {
      return apiError('RATE_LIMITED', 'Too many try-on requests. Please wait a minute.', 429, true, {
        ...cors,
        'Retry-After': String(limit.retryAfter),
      });
    }
  } catch {
    return apiError('INTERNAL_ERROR', 'Request protection is temporarily unavailable.', 503, true, cors);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('BAD_REQUEST', 'Send face and product images as multipart form data.', 400, false, cors);
  }

  const beautyCategory = beautyCategorySchema.safeParse(form.get('beautyCategory'));
  if (!beautyCategory.success)
    return apiError('BAD_REQUEST', 'Choose a valid beauty product category.', 400, false, cors);

  const shadeHex = shadeHexSchema.safeParse(form.get('shadeHex') ?? undefined);
  if (!shadeHex.success)
    return apiError('BAD_REQUEST', 'shadeHex must be a 6-digit hex colour such as #e91e63.', 400, false, cors);

  try {
    const [face, product] = await Promise.all([
      validateImage(form.get('face')),
      validateImage(form.get('product')),
    ]);
    const provider = getBeautyProvider();
    const job = await provider.submit({
      faceImage: dataUri(face),
      productImage: dataUri(product),
      beautyCategory: beautyCategory.data,
      shadeHex: shadeHex.data,
      controlledFailure:
        form.get('testFailure') === 'true' && process.env.TRYON_PROVIDER !== 'fashn',
    });
    const exp = Date.now() + 15 * 60_000;
    const jobToken = signToken({ kind: 'beauty-mock', readyAt: job.readyAt, fail: job.fail, exp });
    return Response.json(
      { ok: true, jobToken, status: 'processing', provider: job.provider },
      { status: 202, headers: cors },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid image upload.';
    const imageError = /image|JPEG|PNG|WebP|10 MB|file type|decoded/i.test(message);
    return apiError(
      imageError ? 'INVALID_IMAGE' : 'PROVIDER_ERROR',
      imageError ? message : 'The beauty try-on service could not accept this request.',
      imageError ? 400 : 502,
      !imageError,
      cors,
    );
  }
}
