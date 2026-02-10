/**
 * HTML → PDF generator. Uses puppeteer locally and puppeteer-core + @sparticuz/chromium on Vercel/Lambda.
 */
import type { Browser } from 'puppeteer-core';
import { notoSansCss } from './notoSans.js';

function isServerless(): boolean {
  return process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

function wrapHtmlWithMetaAndFonts(html: string): string {
  let wrapped = html;
  if (!/<meta\s+[^>]*charset\s*=/i.test(html)) {
    wrapped = html.replace(/<head[^>]*>/i, (m) => `${m}<meta charset="utf-8">`);
    if (wrapped === html && !/<head/i.test(html)) {
      wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
    }
  }
  const fontCss = notoSansCss();
  if (/<head[^>]*>/i.test(wrapped)) {
    wrapped = wrapped.replace(/<head[^>]*>/i, (m) => `${m}${fontCss}`);
  } else if (/<meta\s+[^>]*charset[^>]*>/i.test(wrapped)) {
    wrapped = wrapped.replace(/<meta\s+[^>]*charset[^>]*>/i, (m) => `${m}${fontCss}`);
  } else {
    wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8">${fontCss}</head><body>${html}</body></html>`;
  }
  return wrapped;
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const wrappedHtml = wrapHtmlWithMetaAndFonts(html);

  let browser: Browser | null = null;

  try {
    if (isServerless()) {
      const puppeteer = await import('puppeteer-core');
      const chromium = await import('@sparticuz/chromium');

      browser = await puppeteer.default.launch({
        executablePath: await chromium.default.executablePath(),
        args: chromium.default.args,
        headless: 'shell',
      });
    } else {
      const puppeteer = await import('puppeteer');
      browser = await puppeteer.default.launch();
    }

    const page = await browser!.newPage();
    await page.setContent(wrappedHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });
    return Buffer.from(pdfBuffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[PDF] ${msg}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
