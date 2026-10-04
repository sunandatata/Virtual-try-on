import { MAX_IMAGE_BYTES } from '@virtual-try-on/shared';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { dataUri, validateImage, type ValidImage } from './images';

describe('validateImage', () => {
  async function createFixture(format: 'png' | 'jpeg' | 'webp') {
    const image = sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 100, b: 50 },
      },
    });
    const buffer =
      format === 'jpeg'
        ? await image.jpeg().toBuffer()
        : format === 'png'
          ? await image.png().toBuffer()
          : await image.webp().toBuffer();

    return new File([buffer], `test.${format}`, {
      type: format === 'jpeg' ? 'image/jpeg' : `image/${format}`,
    });
  }

  it('validates and accepts valid PNG files', async () => {
    const file = await createFixture('png');
    const result = await validateImage(file);

    expect(result.mime).toBe('image/png');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('validates and accepts valid JPEG files', async () => {
    const file = await createFixture('jpeg');
    const result = await validateImage(file);

    expect(result.mime).toBe('image/jpeg');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  it('validates and accepts valid WebP files', async () => {
    const file = await createFixture('webp');
    const result = await validateImage(file);

    expect(result.mime).toBe('image/webp');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  it('rejects values that are not File instances', async () => {
    await expect(validateImage(null)).rejects.toThrow('An image file is required.');
    await expect(validateImage('https://example.com/photo.png' as unknown as File)).rejects.toThrow(
      'An image file is required.',
    );
  });

  it('rejects unsupported MIME types', async () => {
    const gif = new File([new Uint8Array(10)], 'photo.gif', { type: 'image/gif' });
    await expect(validateImage(gif)).rejects.toThrow('Use a JPEG, PNG, or WebP image.');

    const text = new File(['text content'], 'doc.txt', { type: 'text/plain' });
    await expect(validateImage(text)).rejects.toThrow('Use a JPEG, PNG, or WebP image.');
  });

  it('rejects empty files (0 bytes)', async () => {
    const empty = new File([], 'empty.png', { type: 'image/png' });
    await expect(validateImage(empty)).rejects.toThrow('Images must be no larger than 10 MB.');
  });

  it('rejects oversized files (> MAX_IMAGE_BYTES)', async () => {
    const large = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'big.png', {
      type: 'image/png',
    });
    await expect(validateImage(large)).rejects.toThrow('Images must be no larger than 10 MB.');
  });

  it('rejects corrupt image bytes', async () => {
    const corrupt = new File([new TextEncoder().encode('not-really-a-png')], 'corrupt.png', {
      type: 'image/png',
    });
    await expect(validateImage(corrupt)).rejects.toThrow(
      'The image content does not match its file type or cannot be decoded.',
    );
  });

  it('rejects format mismatch (e.g. JPEG bytes with image/png MIME)', async () => {
    const jpegBuffer = await sharp({
      create: { width: 5, height: 5, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const mismatched = new File([jpegBuffer], 'fake.png', { type: 'image/png' });
    await expect(validateImage(mismatched)).rejects.toThrow(
      'The image content does not match its file type or cannot be decoded.',
    );
  });
});

describe('dataUri', () => {
  it('formats a data URI correctly with base64 data', () => {
    const sample: ValidImage = {
      buffer: Buffer.from('hello-world'),
      mime: 'image/png',
    };
    const uri = dataUri(sample);
    expect(uri).toBe(`data:image/png;base64,${Buffer.from('hello-world').toString('base64')}`);
  });
});
