export type ExtensionSettings = {
  apiUrl: string;
  accessCode: string;
  consent: boolean;
};

const LEGACY_DEFAULT_API_URL = 'http://localhost:3000';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl: import.meta.env.VITE_LOCAL_API_ORIGIN?.trim() || LEGACY_DEFAULT_API_URL,
  accessCode: '',
  consent: false,
};

export async function getSettings(): Promise<ExtensionSettings> {
  if (typeof chrome === 'undefined' || !chrome.storage) return DEFAULT_SETTINGS;
  const saved = await chrome.storage.local.get(['apiUrl', 'accessCode', 'consent']);
  return {
    apiUrl: resolveApiUrl(saved.apiUrl),
    accessCode: typeof saved.accessCode === 'string' ? saved.accessCode : '',
    consent: saved.consent === true,
  };
}

export function resolveApiUrl(
  savedApiUrl: unknown,
  defaultApiUrl = DEFAULT_SETTINGS.apiUrl,
): string {
  if (typeof savedApiUrl !== 'string' || !savedApiUrl) return defaultApiUrl;
  if (savedApiUrl === LEGACY_DEFAULT_API_URL && defaultApiUrl !== LEGACY_DEFAULT_API_URL) {
    return defaultApiUrl;
  }
  return savedApiUrl;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set(settings);
}

export function validateApiUrl(input: string): string {
  const url = new URL(input);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Use HTTPS, or HTTP only for a local development backend.');
  }
  return url.origin;
}
