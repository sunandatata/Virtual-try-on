import { apiError, corsHeaders, optionsResponse, verifyAccess, verifyOrigin } from '@/lib/http';
import { verifyToken } from '@/lib/token';

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
  if (!token) return apiError('INVALID_TOKEN', 'A result token is required.', 400, false, cors);

  try {
    const payload = verifyToken(token);
    if (payload.kind !== 'result') throw new Error('Wrong token type');
    const target = new URL(payload.url);
    if (target.protocol !== 'https:' || target.hostname !== 'cdn.fashn.ai') {
      throw new Error('Untrusted result host');
    }
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    if (!upstream.ok || !upstream.body) throw new Error('Result unavailable');
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) throw new Error('Unexpected result content');
    return new Response(upstream.body, {
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'inline; filename="virtual-try-on-result.png"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return apiError(
      'INVALID_TOKEN',
      'This result link is invalid, expired, or unavailable.',
      400,
      false,
      cors,
    );
  }
}
