/**
 * Returns a <style> block that defines Noto Sans font via embedded base64 TTF.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getFontPath(): string {
  // Compiled output is dist/pdf/notoSans.js; font lives in src/assets/fonts/
  return join(__dirname, '../../src/assets/fonts/NotoSans-Regular.ttf');
}

export function notoSansCss(): string {
  let ttfBase64: string;
  try {
    const fontPath = getFontPath();
    const buf = readFileSync(fontPath);
    ttfBase64 = buf.toString('base64');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[PDF-FONT] ${msg}`);
  }

  return `<style>
@font-face {
  font-family: 'Noto Sans';
  src: url(data:font/ttf;base64,${ttfBase64}) format('truetype');
  font-weight: normal;
  font-style: normal;
}
body { font-family: 'Noto Sans', sans-serif; }
</style>`;
}
