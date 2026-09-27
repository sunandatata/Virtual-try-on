export type ExtensionSettings = {
  apiUrl: string;
  accessCode: string;
  consent: boolean;
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl: 'http://localhost:3000',
  accessCode: '',
  consent: false,
};

export async function getSettings(): Promise<ExtensionSettings> {
  if (typeof chrome === 'undefined' || !chrome.storage) return DEFAULT_SETTINGS;
  const saved = await chrome.storage.local.get(['apiUrl', 'accessCode', 'consent']);
  return {
    apiUrl: typeof saved.apiUrl === 'string' ? saved.apiUrl : DEFAULT_SETTINGS.apiUrl,
    accessCode: typeof saved.accessCode === 'string' ? saved.accessCode : '',
    consent: saved.consent === true,
  };
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
