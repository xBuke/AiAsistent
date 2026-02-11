#!/usr/bin/env node
/**
 * Generates favicon assets from CIVIS logo.
 * Crops to square centered on the shield icon, removes whitespace.
 */
import { Jimp } from 'jimp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const srcPath = join(publicDir, 'civis_logo.png');

async function main() {
  const img = await Jimp.read(srcPath);
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  // Crop to square centered on shield. Shield is in upper portion;
  // CIVIS text is below. Bias crop upward to capture shield.
  const size = Math.min(w, h);
  const cropY = Math.max(0, Math.floor((h - size) * 0.12));
  const cropX = Math.max(0, Math.floor((w - size) / 2));

  const cropped = img.crop({ x: cropX, y: cropY, w: size, h: size });

  const sizes = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  const png16 = cropped.clone().resize({ w: 16, h: 16 });
  const png32 = cropped.clone().resize({ w: 32, h: 32 });

  for (const { name, size: s } of sizes) {
    const resized = cropped.clone().resize({ w: s, h: s });
    const outPath = join(publicDir, name);
    await resized.write(outPath);
    console.log(`Wrote ${name}`);
  }

  // Create favicon.ico (multi-resolution: 32x32 and 16x16)
  const buf16 = await png16.getBuffer('image/png');
  const buf32 = await png32.getBuffer('image/png');
  const icoBuf = await pngToIco([buf16, buf32]);
  writeFileSync(join(publicDir, 'favicon.ico'), icoBuf);
  console.log('Wrote favicon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
