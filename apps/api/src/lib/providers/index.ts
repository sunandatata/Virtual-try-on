import { FashnTryOnProvider } from './fashn';
import { MockTryOnProvider } from './mock';
import type { TryOnProvider } from './types';

export function getProvider(): TryOnProvider {
  return process.env.TRYON_PROVIDER === 'fashn'
    ? new FashnTryOnProvider()
    : new MockTryOnProvider();
}
