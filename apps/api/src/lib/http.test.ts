import { beforeEach, describe, expect, it } from 'vitest';
import { allowedOrigins, verifyAccess, verifyOrigin } from './http';

describe('request security', () => {
  beforeEach(() => {
    process.env.ALLOWED_EXTENSION_ORIGINS = 'chrome-extension://abc,http://localhost:5173';
    process.env.APP_ACCESS_CODE = 'code';
  });

  it('uses exact CORS allowlisting', () => {
    expect(allowedOrigins().has('chrome-extension://abc')).toBe(true);
    expect(
      verifyOrigin(new Request('http://test', { headers: { Origin: 'chrome-extension://evil' } }))
        .allowed,
    ).toBe(false);
  });

  it('requires the configured access code', () => {
    expect(verifyAccess(new Request('http://test', { headers: { 'X-Access-Code': 'code' } }))).toBe(
      true,
    );
    expect(verifyAccess(new Request('http://test'))).toBe(false);
  });
});
