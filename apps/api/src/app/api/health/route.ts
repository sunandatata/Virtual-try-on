import { corsHeaders, optionsResponse, verifyOrigin } from '@/lib/http';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export function GET(request: Request) {
  const { allowed, origin } = verifyOrigin(request);
  if (!allowed) {
    return Response.json(
      {
        ok: false,
        error: { code: 'FORBIDDEN_ORIGIN', message: 'Origin not allowed.', retryable: false },
      },
      { status: 403 },
    );
  }
  return Response.json(
    { ok: true, service: 'virtual-try-on-api', provider: process.env.TRYON_PROVIDER ?? 'mock' },
    { headers: corsHeaders(origin) },
  );
}
