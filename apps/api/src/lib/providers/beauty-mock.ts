import type { BeautyProviderJob, BeautyProviderSubmission, BeautyTryOnProvider, ProviderStatus } from './types';

/**
 * Mock beauty try-on provider.
 *
 * Returns a labeled demo SVG that clearly indicates no real AI transformation
 * has occurred. Replace this with a real SDK (e.g. Banuba, ModiFace) once a
 * commercial license and API key are obtained.
 *
 * HOW TO OBTAIN A REAL BEAUTY PROVIDER:
 * - Banuba: https://www.banuba.com/ar-makeup-sdk  (commercial license required)
 * - ModiFace (L'Oréal): contact via https://modiface.com/contact/
 * - Perfect Corp YouCam: https://www.perfectcorp.com/business/sdk/face-makeup
 *
 * None of these may be used in a Manifest V3 extension via remote code loading.
 * You must bundle their SDK locally following their distribution terms.
 */
export class MockBeautyTryOnProvider implements BeautyTryOnProvider {
  async submit(input: BeautyProviderSubmission): Promise<BeautyProviderJob> {
    const readyAt = Date.now() + (process.env.NODE_ENV === 'test' ? 5 : 1600);
    return { provider: 'beauty-mock', jobId: 'beauty-demo', readyAt, fail: input.controlledFailure };
  }

  async status(
    _jobId: string,
    metadata?: { readyAt?: number; fail?: boolean },
  ): Promise<ProviderStatus> {
    if (Date.now() < (metadata?.readyAt ?? 0)) return { status: 'processing' };
    if (metadata?.fail) return { status: 'failed', error: 'The requested demo failure occurred.' };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
      <defs>
        <linearGradient id="bg" x2="0" y2="1">
          <stop stop-color="#fce4ec"/>
          <stop offset="1" stop-color="#f8bbd0"/>
        </linearGradient>
      </defs>
      <rect width="600" height="800" fill="url(#bg)"/>
      <ellipse cx="300" cy="300" rx="160" ry="200" fill="#f7cbb7"/>
      <ellipse cx="300" cy="420" rx="40" ry="12" fill="#e91e63" opacity="0.7"/>
      <text x="300" y="650" font-family="sans-serif" font-size="40" text-anchor="middle" fill="#880e4f">DEMO BEAUTY</text>
      <text x="300" y="700" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#880e4f">Preview only — no real AR applied</text>
      <text x="300" y="740" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#ad1457">Real beauty try-on requires a licensed SDK</text>
    </svg>`;
    return {
      status: 'succeeded',
      resultUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      isDemo: true,
    };
  }
}
