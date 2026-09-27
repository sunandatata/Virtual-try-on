import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/try-on rejection', () => {
  beforeEach(() => {
    process.env.ALLOWED_EXTENSION_ORIGINS = 'chrome-extension://abc';
    process.env.APP_ACCESS_CODE = '';
    process.env.TRYON_PROVIDER = 'mock';
  });

  it('rejects non-multipart requests and disallowed origins', async () => {
    const badOrigin = await POST(
      new Request('http://localhost/api/try-on', {
        method: 'POST',
        headers: { Origin: 'chrome-extension://wrong', 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(badOrigin.status).toBe(403);

    const badShape = await POST(
      new Request('http://localhost/api/try-on', {
        method: 'POST',
        headers: { Origin: 'chrome-extension://abc', 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(badShape.status).toBe(400);
  });

  it('refuses remote URL fields instead of fetching them', async () => {
    const form = new FormData();
    form.set('category', 'dress');
    form.set('person', 'https://attacker.example/person.png');
    form.set('garment', 'https://attacker.example/garment.png');
    const response = await POST(
      new Request('http://localhost/api/try-on', {
        method: 'POST',
        headers: { Origin: 'chrome-extension://abc' },
        body: form,
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_IMAGE' } });
  });
});
