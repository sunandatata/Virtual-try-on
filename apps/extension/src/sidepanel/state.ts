import type { GenerationStatus } from '@virtual-try-on/shared';

export type GenerationState = {
  status: GenerationStatus;
  message: string;
  jobToken?: string;
  isDemo?: boolean;
};

export const idleGeneration: GenerationState = { status: 'idle', message: '' };

export function canGenerate(input: {
  person: boolean;
  garment: boolean;
  consent: boolean;
  category: boolean;
  status: GenerationStatus;
}): boolean {
  return (
    input.person &&
    input.garment &&
    input.consent &&
    input.category &&
    input.status !== 'submitting' &&
    input.status !== 'processing'
  );
}
