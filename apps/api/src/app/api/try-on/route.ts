import { garmentCategorySchema, toProviderCategory } from '@virtual-try-on/shared';
import { apiError, corsHeaders, optionsResponse, verifyAccess, verifyOrigin } from '@/lib/http';
import { dataUri, validateImage } from '@/lib/images';
import { getProvider } from '@/lib/providers';
import { rateLimiter } from '@/lib/rate-limit';
import { signToken } from '@/lib/token';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

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
      return apiError(
        'RATE_LIMITED',
        'Too many try-on requests. Please wait a minute.',
        429,
        true,
        {
          ...cors,
          'Retry-After': String(limit.retryAfter),
        },
      );
    }
  } catch {
    return apiError(
      'INTERNAL_ERROR',
      'Request protection is temporarily unavailable.',
      503,
      true,
      cors,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(
      'BAD_REQUEST',
      'Send person and garment images as multipart form data.',
      400,
      false,
      cors,
    );
  }

  const category = garmentCategorySchema.safeParse(form.get('category'));
  if (!category.success)
    return apiError('BAD_REQUEST', 'Choose a valid garment category.', 400, false, cors);

  try {
    const [person, garment] = await Promise.all([
      validateImage(form.get('person')),
      validateImage(form.get('garment')),
    ]);
    const provider = getProvider();
    const job = await provider.submit({
      modelImage: dataUri(person),
      garmentImage: dataUri(garment),
      category: toProviderCategory(category.data),
      controlledFailure:
        form.get('testFailure') === 'true' && process.env.TRYON_PROVIDER !== 'fashn',
    });
    const exp = Date.now() + 15 * 60_000;
    const jobToken =
      job.provider === 'mock'
        ? signToken({ kind: 'mock', readyAt: job.readyAt, fail: job.fail, exp })
        : signToken({ kind: 'fashn', providerJobId: job.jobId, exp });
    return Response.json(
      { ok: true, jobToken, status: 'processing', provider: job.provider },
      { status: 202, headers: cors },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid image upload.';
    const imageError = /image|JPEG|PNG|WebP|10 MB|file type|decoded/i.test(message);
    const timeout = message === 'PROVIDER_TIMEOUT';
    return apiError(
      imageError ? 'INVALID_IMAGE' : timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
      imageError
        ? message
        : timeout
          ? 'The try-on provider took too long to respond. Please retry.'
          : 'The try-on service could not accept this request.',
      imageError ? 400 : timeout ? 504 : 502,
      !imageError,
      cors,
    );
  }
}
