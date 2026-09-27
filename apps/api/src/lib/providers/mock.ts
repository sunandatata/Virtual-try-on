import type { ProviderJob, ProviderStatus, ProviderSubmission, TryOnProvider } from './types';

export class MockTryOnProvider implements TryOnProvider {
  async submit(input: ProviderSubmission): Promise<ProviderJob> {
    const readyAt = Date.now() + (process.env.NODE_ENV === 'test' ? 5 : 1600);
    return { provider: 'mock', jobId: 'demo', readyAt, fail: input.controlledFailure };
  }

  async status(
    _jobId: string,
    metadata?: { readyAt?: number; fail?: boolean },
  ): Promise<ProviderStatus> {
    if (Date.now() < (metadata?.readyAt ?? 0)) return { status: 'processing' };
    if (metadata?.fail) return { status: 'failed', error: 'The requested demo failure occurred.' };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#eadfd2"/><stop offset="1" stop-color="#c88f74"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="450" cy="280" r="130" fill="#f7eee8"/><path d="M235 1040V590c0-150 430-150 430 0v450z" fill="#7c4960"/><text x="450" y="1110" font-family="sans-serif" font-size="54" text-anchor="middle" fill="#fff">DEMO RESULT</text><text x="450" y="1170" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#fff">Preview only — no AI transformation</text></svg>`;
    return {
      status: 'succeeded',
      resultUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      isDemo: true,
    };
  }
}
