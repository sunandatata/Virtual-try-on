import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="30" fill="#6f4255"/><path d="M39 39l17-12h16l17 12 17 7-12 27-12-6v37H46V67l-12 6-12-27z" fill="#f7efe8"/><path d="M56 27c2 9 14 9 16 0" fill="none" stroke="#c98a6a" stroke-width="5"/></svg>`;

const personSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960"><rect width="720" height="960" fill="#e9ddd0"/><circle cx="360" cy="215" r="92" fill="#b87352"/><path d="M220 890l35-410c12-140 198-140 210 0l35 410" fill="#f5f0e8"/><path d="M278 890l22-315h120l22 315" fill="#6e5861"/></svg>`;
const dressSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="900"><rect width="760" height="900" fill="#f8f4ef"/><path d="M300 100l80 35 80-35 70 115-73 45 105 520H198l105-520-73-45z" fill="#884e64"/><path d="M330 110q50 80 100 0" fill="none" stroke="#e7bfa9" stroke-width="12"/><circle cx="380" cy="420" r="8" fill="#f0d6c8"/><circle cx="380" cy="470" r="8" fill="#f0d6c8"/></svg>`;
const topSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720"><rect width="720" height="720" fill="#f2eadf"/><path d="M210 170l95-60h110l95 60 100 70-75 120-55-36v280H240V324l-55 36-75-120z" fill="#577b78"/></svg>`;

await mkdir(resolve('public/icons'), { recursive: true });
await mkdir(resolve('public/fixture'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(iconSvg))
    .resize(size, size)
    .png()
    .toFile(resolve(`public/icons/icon-${size}.png`));
}
await Promise.all([
  sharp(Buffer.from(personSvg)).png().toFile(resolve('public/fixture/person.png')),
  sharp(Buffer.from(dressSvg)).png().toFile(resolve('public/fixture/dress.png')),
  sharp(Buffer.from(topSvg)).png().toFile(resolve('public/fixture/top.png')),
]);
