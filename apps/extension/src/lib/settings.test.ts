import { describe, expect, it } from 'vitest';
import { validateApiUrl } from './settings';

describe('backend URL settings', () => {
  it('allows HTTPS and local HTTP', () => {
    expect(validateApiUrl('https://tryon.example/api')).toBe('https://tryon.example');
    expect(validateApiUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });
  it('rejects insecure remote and non-web URLs', () => {
    expect(() => validateApiUrl('http://tryon.example')).toThrow(/HTTPS/);
    expect(() => validateApiUrl('file:///secret')).toThrow(/HTTPS/);
  });
});
