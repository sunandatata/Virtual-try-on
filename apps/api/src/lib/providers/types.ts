import type { BeautyCategory, ProviderCategory } from '@virtual-try-on/shared';

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

// Beauty try-on provider

export type BeautyProviderJob = {
  provider: 'beauty-mock';
  jobId: string;
  readyAt: number;
  fail: boolean;
};

export type BeautyProviderSubmission = {
  /** Base64 data URI of the face photo */
  faceImage: string;
  /** Base64 data URI of the makeup product image */
  productImage: string;
  /** Makeup category */
  beautyCategory: BeautyCategory;
  /** Optional hex shade override extracted from product metadata */
  shadeHex?: string;
  controlledFailure: boolean;
};

export interface BeautyTryOnProvider {
  submit(input: BeautyProviderSubmission): Promise<BeautyProviderJob>;
  status(jobId: string, metadata?: { readyAt?: number; fail?: boolean }): Promise<ProviderStatus>;
}
