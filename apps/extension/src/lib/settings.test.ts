import { describe, expect, it } from 'vitest';
import { resolveApiUrl, validateApiUrl } from './settings';

describe('backend URL settings', () => {
  it('migrates the old development default when a local build selects another port', () => {
    expect(resolveApiUrl('http://localhost:3000', 'http://localhost:3001')).toBe(
      'http://localhost:3001',
    );
    expect(resolveApiUrl('https://api.example.com', 'http://localhost:3001')).toBe(
      'https://api.example.com',
    );
  });

  it('allows HTTPS and local HTTP', () => {
    expect(validateApiUrl('https://tryon.example/api')).toBe('https://tryon.example');
    expect(validateApiUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });
  it('rejects insecure remote and non-web URLs', () => {
    expect(() => validateApiUrl('http://tryon.example')).toThrow(/HTTPS/);
    expect(() => validateApiUrl('file:///secret')).toThrow(/HTTPS/);
  });
});
