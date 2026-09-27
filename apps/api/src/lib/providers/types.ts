import type { ProviderCategory } from '@virtual-try-on/shared';

export type ProviderSubmission = {
  modelImage: string;
  garmentImage: string;
  category: ProviderCategory;
  controlledFailure: boolean;
};

export type ProviderJob =
  | { provider: 'mock'; jobId: string; readyAt: number; fail: boolean }
  | { provider: 'fashn'; jobId: string };

export type ProviderStatus =
  | { status: 'processing' }
  | { status: 'succeeded'; resultUrl: string; isDemo: boolean }
  | { status: 'failed'; error: string };

export interface TryOnProvider {
  submit(input: ProviderSubmission): Promise<ProviderJob>;
  status(jobId: string, metadata?: { readyAt?: number; fail?: boolean }): Promise<ProviderStatus>;
}
