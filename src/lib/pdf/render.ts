import 'server-only';

import type { Browser, PDFOptions } from 'puppeteer-core';

/**
 * HTML → PDF with headless Chromium (puppeteer-core). The only reliable way to get correct
 * Arabic shaping + RTL (ARCHITECTURE §2).
 *
 * Executable: `CHROMIUM_EXECUTABLE_PATH` (local, e.g. /opt/pw-browsers/chromium) else
 * `@sparticuz/chromium` (Vercel). One browser per server process is reused; each render opens
 * a fresh page and is bounded by a timeout. Embed fonts with `pdfBaseCss()` from `./fonts`.
 */

export type PdfMargins = { top?: string; right?: string; bottom?: string; left?: string };

export type RenderPdfOptions = {
  /** Complete HTML document (include `<html dir>` and fonts via `pdfBaseCss()`). */
  html: string;
  landscape?: boolean;
  format?: PDFOptions['format'];
  margins?: PdfMargins;
  /** Chromium header/footer templates (use `<span class="pageNumber"></span>` etc.). */
  headerTemplate?: string;
  footerTemplate?: string;
  /** Hard limit for the whole render (ms). Default 30 s. */
  timeoutMs?: number;
};

export class PdfRenderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfRenderError';
  }
}

type GlobalWithBrowser = typeof globalThis & { __hrPdfBrowser?: Promise<Browser> | null };
const g = globalThis as GlobalWithBrowser;

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer-core');
  const localPath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
  if (localPath) {
    return puppeteer.launch({
      executablePath: localPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-gpu'],
    });
  }
  const chromiumModule = await import('@sparticuz/chromium');
  const c = ((chromiumModule as unknown as { default?: unknown }).default ?? chromiumModule) as {
    args: string[];
    executablePath: () => Promise<string>;
  };
  return puppeteer.launch({
    executablePath: await c.executablePath(),
    headless: true,
    args: [...c.args, '--font-render-hinting=none'],
  });
}

async function getBrowser(): Promise<Browser> {
  if (g.__hrPdfBrowser) {
    try {
      const browser = await g.__hrPdfBrowser;
      if (browser.connected) return browser;
    } catch {
      // fall through and relaunch
    }
  }
  const launching = launchBrowser();
  g.__hrPdfBrowser = launching;
  try {
    const browser = await launching;
    browser.on('disconnected', () => {
      if (g.__hrPdfBrowser === launching) g.__hrPdfBrowser = null;
    });
    return browser;
  } catch (error) {
    g.__hrPdfBrowser = null;
    throw new PdfRenderError('Chromium could not be launched', { cause: error });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PdfRenderError(`PDF render timed out after ${ms} ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Renders HTML to a PDF buffer. Throws `PdfRenderError` (map to `errors.pdfFailed`). */
export async function renderPdf(options: RenderPdfOptions): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const browser = await withTimeout(getBrowser(), timeoutMs);
  const page = await browser.newPage();
  try {
    return await withTimeout(
      (async () => {
        page.setDefaultTimeout(timeoutMs);
        // Block every network request: PDFs must be self-contained (fonts/images inline as data URLs),
        // except https images such as the public branding logo.
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const url = req.url();
          if (url.startsWith('data:') || url === 'about:blank' || (req.resourceType() === 'image' && /^https?:\/\//.test(url))) {
            void req.continue();
          } else {
            void req.abort();
          }
        });
        await page.setContent(options.html, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const margins = { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm', ...options.margins };
        const pdf = await page.pdf({
          format: options.format ?? 'A4',
          landscape: options.landscape ?? false,
          printBackground: true,
          margin: margins,
          displayHeaderFooter: Boolean(options.headerTemplate || options.footerTemplate),
          headerTemplate: options.headerTemplate ?? '<span></span>',
          footerTemplate: options.footerTemplate ?? '<span></span>',
          preferCSSPageSize: false,
        });
        return Buffer.from(pdf);
      })(),
      timeoutMs,
    );
  } catch (error) {
    if (error instanceof PdfRenderError) throw error;
    throw new PdfRenderError('PDF render failed', { cause: error });
  } finally {
    page.close().catch(() => {});
  }
}

/** Closes the shared browser (tests / graceful shutdown). */
export async function closePdfBrowser(): Promise<void> {
  const current = g.__hrPdfBrowser;
  g.__hrPdfBrowser = null;
  if (current) {
    try {
      await (await current).close();
    } catch {
      // ignore
    }
  }
}
