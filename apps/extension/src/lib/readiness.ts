import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@virtual-try-on/shared';

export type ReadinessLevel = 'ready' | 'may-work' | 'replace-recommended';
export type ReadinessRole = 'person' | 'garment';

export type ReadinessCheck = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  blocking: boolean;
};

export type ImageReadiness = {
  level: ReadinessLevel;
  canContinue: boolean;
  checks: ReadinessCheck[];
};

export type ReadinessInput = {
  role: ReadinessRole;
  decoded: boolean;
  mime: string;
  size: number;
  width: number;
  height: number;
  uniformity?: number;
};

function check(
  code: string,
  severity: ReadinessCheck['severity'],
  message: string,
  blocking = false,
): ReadinessCheck {
  return { code, severity, message, blocking };
}

export function estimatePixelUniformity(pixels: Uint8ClampedArray): number {
  const pixelCount = Math.floor(pixels.length / 4);
  if (pixelCount === 0) return 1;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let visible = 0;
  for (let index = 0; index < pixelCount * 4; index += 4) {
    if ((pixels[index + 3] ?? 0) < 16) continue;
    const luminance =
      0.2126 * (pixels[index] ?? 0) +
      0.7152 * (pixels[index + 1] ?? 0) +
      0.0722 * (pixels[index + 2] ?? 0);
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    visible += 1;
  }
  if (visible === 0) return 1;
  const mean = luminanceSum / visible;
  const variance = Math.max(0, luminanceSquaredSum / visible - mean * mean);
  const standardDeviation = Math.sqrt(variance);
  return Math.max(0, Math.min(1, 1 - standardDeviation / 64));
}

export function analyzeImageReadiness(input: ReadinessInput): ImageReadiness {
  const checks: ReadinessCheck[] = [];
  if (!input.decoded) {
    checks.push(
      check(
        'decode-failed',
        'error',
        'The image cannot be decoded. Replace it with a valid JPEG, PNG, or WebP file.',
        true,
      ),
    );
  }
  if (!IMAGE_MIME_TYPES.includes(input.mime as (typeof IMAGE_MIME_TYPES)[number])) {
    checks.push(
      check('unsupported-type', 'error', 'The file type is not supported for generation.', true),
    );
  }
  if (input.size <= 0 || input.size > MAX_IMAGE_BYTES) {
    checks.push(
      check('unsupported-size', 'error', 'The image must be between 1 byte and 10 MB.', true),
    );
  }
  if (input.width <= 0 || input.height <= 0) {
    checks.push(check('invalid-dimensions', 'error', 'The image dimensions are invalid.', true));
  } else {
    const shortest = Math.min(input.width, input.height);
    const longest = Math.max(input.width, input.height);
    const aspect = input.width / input.height;
    if (longest < 256 || shortest < 128) {
      checks.push(
        check(
          'too-small',
          'error',
          `This ${input.role} image is extremely small and should be replaced.`,
        ),
      );
    } else if (longest < 768 || shortest < 384) {
      checks.push(
        check(
          'thumbnail-risk',
          'warning',
          `This ${input.role} image may be a thumbnail; a larger image should produce a clearer result.`,
        ),
      );
    }
    const extremeAspect = aspect < 0.15 || aspect > 4;
    const unusualAspect =
      input.role === 'person' ? aspect < 0.35 || aspect > 1.5 : aspect < 0.25 || aspect > 2.5;
    if (extremeAspect) {
      checks.push(
        check(
          'extreme-aspect',
          'error',
          'The image is extremely narrow or wide; replacement is recommended.',
        ),
      );
    } else if (unusualAspect) {
      checks.push(
        check(
          'unusual-aspect',
          'warning',
          `The ${input.role} image has an unusual aspect ratio and may crop important details.`,
        ),
      );
    }
  }
  if (input.uniformity !== undefined) {
    if (input.uniformity >= 0.985) {
      checks.push(
        check(
          'nearly-uniform',
          'error',
          'The image appears nearly blank or uniform; replacement is recommended.',
        ),
      );
    } else if (input.uniformity >= 0.96) {
      checks.push(
        check(
          'low-detail',
          'warning',
          'The image has very little visual variation and may not contain enough detail.',
        ),
      );
    }
  }
  if (checks.length === 0) {
    checks.push(
      check('ready', 'info', 'Resolution, aspect ratio, file size, and visual detail look usable.'),
    );
  }
  const canContinue = !checks.some((candidate) => candidate.blocking);
  const level = checks.some((candidate) => candidate.severity === 'error')
    ? 'replace-recommended'
    : checks.some((candidate) => candidate.severity === 'warning')
      ? 'may-work'
      : 'ready';
  return { level, canContinue, checks };
}

export async function inspectImageReadiness(
  input: Omit<ReadinessInput, 'decoded' | 'uniformity'> & { blob: Blob },
): Promise<ImageReadiness> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input.blob);
  } catch {
    return analyzeImageReadiness({ ...input, decoded: false });
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return analyzeImageReadiness({ ...input, decoded: true });
    context.drawImage(bitmap, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    return analyzeImageReadiness({
      ...input,
      decoded: true,
      uniformity: estimatePixelUniformity(pixels),
    });
  } finally {
    bitmap.close();
  }
}
