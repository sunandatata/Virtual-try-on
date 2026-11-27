import { FashnTryOnProvider } from './fashn';
import { MockTryOnProvider } from './mock';
import { MockBeautyTryOnProvider } from './beauty-mock';
import type { BeautyTryOnProvider, TryOnProvider } from './types';

export function getProvider(): TryOnProvider {
  return process.env.TRYON_PROVIDER === 'fashn'
    ? new FashnTryOnProvider()
    : new MockTryOnProvider();
}

export function getBeautyProvider(): BeautyTryOnProvider {
  // When a real beauty SDK is configured, instantiate it here.
  // Currently always returns the mock which produces clearly-labelled demo output.
  return new MockBeautyTryOnProvider();
}
