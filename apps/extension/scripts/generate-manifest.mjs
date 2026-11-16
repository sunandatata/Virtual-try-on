import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const apiOrigin = process.env.VITE_PRODUCTION_API_ORIGIN;
const localApiOrigin = process.env.VITE_LOCAL_API_ORIGIN ?? (await readLocalApiOrigin());
const optionalHosts = ['http://localhost:3000/*'];
if (localApiOrigin) {
  const url = new URL(localApiOrigin);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('VITE_LOCAL_API_ORIGIN must be an HTTP localhost origin.');
  }
  const localHost = `${url.origin}/*`;
  if (!optionalHosts.includes(localHost)) optionalHosts.push(localHost);
}
if (apiOrigin) {
  const url = new URL(apiOrigin);
  if (url.protocol !== 'https:') throw new Error('VITE_PRODUCTION_API_ORIGIN must use HTTPS.');
  optionalHosts.push(`${url.origin}/*`);
}

const manifest = {
  manifest_version: 3,
  name: 'Virtual Try-On',
  description: 'Preview clothing with your locally saved body photo while you shop.',
  version: '0.1.0',
  minimum_chrome_version: '116',
  permissions: ['sidePanel', 'activeTab', 'scripting', 'storage', 'contextMenus', 'alarms'],
  optional_host_permissions: optionalHosts,
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_title: 'Open Virtual Try-On', default_icon: iconMap() },
  icons: iconMap(),
  side_panel: { default_path: 'sidepanel.html' },
  options_page: 'options.html',
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'none';" },
};

function iconMap() {
  return {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  };
}

await mkdir(resolve('public'), { recursive: true });
await writeFile(resolve('public/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

async function readLocalApiOrigin() {
  const envFile = await readFile(resolve('.env.local'), 'utf8').catch(() => '');
  const match = envFile.match(/^\s*VITE_LOCAL_API_ORIGIN\s*=\s*(.*?)\s*$/m);
  return match?.[1]?.replace(/^['"]|['"]$/g, '');
}
