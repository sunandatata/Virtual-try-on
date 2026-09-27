import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import archiver from 'archiver';

await mkdir(resolve('release'), { recursive: true });
const destination = resolve('release/virtual-try-on-0.1.0.zip');
const output = createWriteStream(destination);
const archive = archiver('zip', { zlib: { level: 9 } });
const completed = new Promise((resolveDone, reject) => {
  output.on('close', resolveDone);
  archive.on('error', reject);
});
archive.pipe(output);
archive.directory(resolve('dist'), false);
await archive.finalize();
await completed;
console.log(`Created ${destination} (${archive.pointer()} bytes)`);
