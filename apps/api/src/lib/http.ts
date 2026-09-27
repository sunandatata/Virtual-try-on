import type { ApiErrorCode } from '@virtual-try-on/shared';

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  retryable = false,
  headers?: HeadersInit,
) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status, headers });
}

export function corsHeaders(origin: string | null): HeadersInit {
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

export function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EXTENSION_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function verifyOrigin(request: Request): { allowed: boolean; origin: string | null } {
  const origin = request.headers.get('origin');
  if (!origin) return { allowed: process.env.NODE_ENV !== 'production', origin: null };
  return { allowed: allowedOrigins().has(origin), origin };
}

export function optionsResponse(request: Request): Response {
  const { allowed, origin } = verifyOrigin(request);
  if (!allowed) return apiError('FORBIDDEN_ORIGIN', 'This extension origin is not allowed.', 403);
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Access-Code',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export function verifyAccess(request: Request): boolean {
  const expected = process.env.APP_ACCESS_CODE;
  return !expected || request.headers.get('x-access-code') === expected;
}
