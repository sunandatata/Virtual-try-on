import { apiError, corsHeaders, optionsResponse, verifyAccess, verifyOrigin } from '@/lib/http';
import { FashnTryOnProvider } from '@/lib/providers/fashn';
import { MockTryOnProvider } from '@/lib/providers/mock';
import { signToken, verifyToken } from '@/lib/token';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const { allowed, origin } = verifyOrigin(request);
  const cors = corsHeaders(origin);
  if (!allowed) return apiError('FORBIDDEN_ORIGIN', 'This extension origin is not allowed.', 403);
  if (!verifyAccess(request))
    return apiError('UNAUTHORIZED', 'The access code is not valid.', 401, false, cors);
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return apiError('INVALID_TOKEN', 'A job token is required.', 400, false, cors);

  try {
    const payload = verifyToken(token);
    if (payload.kind === 'result') throw new Error('Wrong token type');
    const provider = payload.kind === 'mock' ? new MockTryOnProvider() : new FashnTryOnProvider();
    const status = await provider.status(
      payload.kind === 'mock' ? 'demo' : payload.providerJobId,
      payload.kind === 'mock' ? { readyAt: payload.readyAt, fail: payload.fail } : undefined,
    );
    if (status.status !== 'succeeded' || status.isDemo) {
      return Response.json({ ok: true, ...status }, { headers: cors });
    }
    const resultToken = signToken({
      kind: 'result',
      url: status.resultUrl,
      exp: Date.now() + 10 * 60_000,
    });
    const resultUrl = `/api/try-on/result?token=${encodeURIComponent(resultToken)}`;
    return Response.json({ ok: true, ...status, resultUrl }, { headers: cors });
  } catch (error) {
    const invalid =
      error instanceof Error && /token|signature|expired|JSON|type/i.test(error.message);
    const timeout = error instanceof Error && error.message === 'PROVIDER_TIMEOUT';
    return apiError(
      invalid ? 'INVALID_TOKEN' : timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
      invalid
        ? 'This job token is invalid or expired.'
        : timeout
          ? 'The try-on provider took too long to respond. Please retry.'
          : 'The provider status is temporarily unavailable.',
      invalid ? 400 : timeout ? 504 : 502,
      !invalid,
      cors,
    );
  }
}
