import { describe, expect, it } from 'vitest';
import { analyzeImageReadiness, estimatePixelUniformity } from './readiness';

function readyInput(overrides: Partial<Parameters<typeof analyzeImageReadiness>[0]> = {}) {
  return {
    role: 'person' as const,
    decoded: true,
    mime: 'image/png',
    size: 500_000,
    width: 900,
    height: 1400,
    uniformity: 0.4,
    ...overrides,
  };
}

describe('input readiness', () => {
  it('reports ready for a supported, detailed image', () => {
    expect(analyzeImageReadiness(readyInput())).toEqual({
      level: 'ready',
      canContinue: true,
      checks: [expect.objectContaining({ code: 'ready', severity: 'info', blocking: false })],
    });
  });

  it('warns about thumbnails and unusual but non-extreme aspect ratios', () => {
    const result = analyzeImageReadiness(
      readyInput({ role: 'garment', width: 800, height: 300, uniformity: 0.5 }),
    );
    expect(result).toMatchObject({ level: 'may-work', canContinue: true });
    expect(result.checks.map((candidate) => candidate.code)).toEqual([
      'thumbnail-risk',
      'unusual-aspect',
    ]);
  });

  it('recommends replacement for very small or nearly uniform images without inventing fit claims', () => {
    const result = analyzeImageReadiness(
      readyInput({ role: 'garment', width: 100, height: 180, uniformity: 0.99 }),
    );
    expect(result).toMatchObject({ level: 'replace-recommended', canContinue: true });
    expect(result.checks.map((candidate) => candidate.code)).toEqual([
      'too-small',
      'nearly-uniform',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/measurement|exact fit|guarantee/i);
  });

  it('blocks files that cannot be decoded or safely submitted', () => {
    const result = analyzeImageReadiness(
      readyInput({ decoded: false, mime: 'image/gif', size: 0, width: 0, height: 0 }),
    );
    expect(result).toMatchObject({ level: 'replace-recommended', canContinue: false });
    expect(result.checks.filter((candidate) => candidate.blocking)).toHaveLength(4);
  });

  it('estimates uniform pixels without retaining image contents', () => {
    const uniform = new Uint8ClampedArray(16 * 4).fill(120);
    uniform.forEach((_value, index) => {
      if (index % 4 === 3) uniform[index] = 255;
    });
    const varied = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255, 20, 80, 140, 255, 230, 30, 70, 255,
    ]);
    expect(estimatePixelUniformity(uniform)).toBeGreaterThanOrEqual(0.985);
    expect(estimatePixelUniformity(varied)).toBeLessThan(0.96);
  });
});
