import { MAX_IMAGE_BYTES } from '@virtual-try-on/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function image(bytes: BlobPart = png, type = 'image/png') {
  return new File([bytes], 'fixture.png', { type });
}

function uploadRequest(person: File, garment = image(), client = 'upload-test') {
  const form = new FormData();
  form.set('category', 'dress');
  form.set('person', person);
  form.set('garment', garment);
  return new Request('http://localhost/api/try-on', {
    method: 'POST',
    headers: { Origin: 'chrome-extension://abc', 'X-Forwarded-For': client },
    body: form,
  });
}

describe('POST /api/try-on rejection', () => {
  beforeEach(() => {
    process.env.ALLOWED_EXTENSION_ORIGINS = 'chrome-extension://abc';
    process.env.APP_ACCESS_CODE = '';
    process.env.TRYON_PROVIDER = 'mock';
    delete process.env.RATE_LIMIT_PROVIDER;
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

  it('requires the configured access code before processing an upload', async () => {
    process.env.APP_ACCESS_CODE = 'required-code';
    const response = await POST(uploadRequest(image(), image(), 'access-test'));

    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('chrome-extension://abc');
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });

  it.each([
    ['unsupported MIME type', image('plain text', 'text/plain')],
    ['oversized image', image(new Uint8Array(MAX_IMAGE_BYTES + 1))],
    ['undecodable image bytes', image('not a real PNG')],
  ])('rejects an %s', async (_case, invalidPerson) => {
    const response = await POST(uploadRequest(invalidPerson, image(), `invalid-${_case}`));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_IMAGE', retryable: false },
    });
  });

  it('returns a retryable error after the per-client request limit', async () => {
    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await POST(
          new Request('http://localhost/api/try-on', {
            method: 'POST',
            headers: {
              Origin: 'chrome-extension://abc',
              'Content-Type': 'application/json',
              'X-Forwarded-For': 'rate-limit-test',
            },
            body: '{}',
          }),
        ),
      );
    }

    expect(responses.slice(0, 10).every((response) => response.status === 400)).toBe(true);
    expect(responses[10].status).toBe(429);
    expect(responses[10].headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await responses[10].json()).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED', retryable: true },
    });
  });
});
